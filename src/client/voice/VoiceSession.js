'use strict';

const { Events, Opcodes } = require('../../util/Constants');
const Util = require('../../util/Util');
const StageChannel = require('../../structures/StageChannel');

/**
 * @typedef {Object} JoinVoiceData
 * @property {boolean} [mute=false] Self mute
 * @property {boolean} [deaf=false] Self deaf
 * @property {boolean} [video=false] Self video (camera)
 * @property {boolean} [stream=false] Go Live stream signal
 * @property {string|null} [streamLink=null] Media URL/path for Go Live (forces UDP)
 * @property {string|null} [videoLink=null] Media URL/path for camera (forces UDP)
 * @property {string|null} [preferredRegion=null] Preferred stream region
 * @property {number} [fps=30] Stream/video fps
 * @property {number} [height=720] Stream/video height
 * @property {number} [width] Stream/video width
 * @property {number} [bitrate=2000] Video bitrate (kbps)
 * @property {number} [audioBitrate=128] Audio bitrate (kbps)
 * @property {boolean} [audio=true] Play audio with stream/video links
 */

/**
 * Normalizes joinVoice data.
 * @param {JoinVoiceData} [data={}] Options
 * @returns {object}
 */
function normalizeData(data = {}) {
  return {
    mute: Boolean(data.mute ?? data.selfMute ?? false),
    deaf: Boolean(data.deaf ?? data.selfDeaf ?? false),
    video: Boolean(data.video ?? data.selfVideo ?? false),
    stream: Boolean(data.stream ?? false),
    streamLink: data.streamLink ?? data.stream_link ?? null,
    videoLink: data.videoLink ?? data.video_link ?? null,
    preferredRegion: data.preferredRegion ?? data.preferred_region ?? null,
    fps: data.fps ?? 30,
    height: data.height ?? 720,
    width: data.width ?? null,
    bitrate: data.bitrate ?? 2000,
    audioBitrate: data.audioBitrate ?? 128,
    audio: data.audio !== false,
  };
}

/**
 * Builds a Discord stream key for a voice channel.
 * @param {Channel} channel Voice channel
 * @param {string} userId User id
 * @returns {string}
 */
function getStreamKey(channel, userId) {
  if (['DM', 'GROUP_DM'].includes(channel.type)) {
    return `call:${channel.id}:${userId}`;
  }
  return `guild:${channel.guild.id}:${channel.id}:${userId}`;
}

/**
 * Waits for the client's voice state to match a predicate.
 * @param {Client} client Discord client
 * @param {Function} predicate Predicate
 * @param {number} [timeout=10_000] Timeout in milliseconds
 * @returns {Promise<VoiceState>}
 */
function waitForSelfVoiceState(client, predicate, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const current = client.user?.voice;
    if (current && predicate(current)) {
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      client.removeListener(Events.VOICE_STATE_UPDATE, onUpdate);
      reject(new Error('VOICE_STATE_TIMEOUT'));
    }, timeout);

    const onUpdate = (_oldState, newState) => {
      if (newState.id !== client.user?.id) return;
      if (!predicate(newState)) return;
      clearTimeout(timer);
      client.removeListener(Events.VOICE_STATE_UPDATE, onUpdate);
      resolve(newState);
    };

    client.on(Events.VOICE_STATE_UPDATE, onUpdate);
  });
}

/**
 * Unified voice session: WS-only unless streamLink/videoLink requires UDP.
 */
class VoiceSession {
  /**
   * @param {ClientVoiceManager} voiceManager Voice manager
   * @param {Channel} channel Voice channel
   * @param {JoinVoiceData} [data={}] Initial options
   */
  constructor(voiceManager, channel, data = {}) {
    this.voiceManager = voiceManager;
    this.channel = channel;
    this.client = voiceManager.client;

    const normalized = normalizeData(data);
    this._mute = normalized.mute;
    this._deaf = normalized.deaf;
    this._video = normalized.video;
    this._streaming = normalized.stream;
    this._streamLink = normalized.streamLink;
    this._videoLink = normalized.videoLink;
    this._preferredRegion = normalized.preferredRegion;
    this._fps = normalized.fps;
    this._height = normalized.height;
    this._width = normalized.width;
    this._bitrate = normalized.bitrate;
    this._audioBitrate = normalized.audioBitrate;
    this._audio = normalized.audio;

    /** @type {?VoiceConnection} */
    this.connection = null;
    /** @type {?StreamConnection} */
    this.streamConnection = null;

    this._streamVideoDispatcher = null;
    this._streamAudioDispatcher = null;
    this._voiceAudioDispatcher = null;
    this._cameraVideoDispatcher = null;
    this._cameraAudioDispatcher = null;

    this._positionMs = 0;
    this._paused = false;
    this._disconnected = false;
    this._udp = Boolean(this._streamLink || this._videoLink);
  }

  /**
   * Whether this session uses a UDP voice connection.
   * @type {boolean}
   * @readonly
   */
  get udp() {
    return this._udp;
  }

  /**
   * Stream key for this session.
   * @type {string}
   * @readonly
   */
  get streamKey() {
    return getStreamKey(this.channel, this.client.user.id);
  }

  /**
   * Whether the session is disconnected.
   * @type {boolean}
   * @readonly
   */
  get disconnected() {
    return this._disconnected;
  }

  /**
   * Connects according to data (WS or UDP).
   * @returns {Promise<this>}
   * @private
   */
  async _connect() {
    if (this._udp) {
      await this._connectUdp();
      if (this._stream || this._streamLink) {
        await this._ensureStreamConnection();
      }
      if (this._streamLink) {
        this._playStreamMedia(0);
      }
      if (this._videoLink) {
        this._video = true;
        await this._sendState();
        this._playVideoMedia(0);
      }
    } else {
      await this._connectWs();
      if (this._streaming) {
        await this._startStreamSignal();
      }
    }
    return this;
  }

  /**
   * Gateway-only join (no UDP).
   * @returns {Promise<void>}
   * @private
   */
  async _connectWs() {
    this._sendVoiceStateUpdate({
      channel_id: this.channel.id,
      self_mute: this._mute,
      self_deaf: this._deaf,
      self_video: this._video,
    });

    await waitForSelfVoiceState(this.client, state => state.channelId === this.channel.id, 15_000);
  }

  /**
   * Full voice join with UDP media path.
   * @returns {Promise<void>}
   * @private
   */
  async _connectUdp() {
    const VoiceConnection = require('./VoiceConnection');

    await new Promise((resolve, reject) => {
      let connection = this.voiceManager.connection;
      if (connection) {
        connection.disconnect();
        this.voiceManager.connection = null;
      }

      connection = new VoiceConnection(this.voiceManager, this.channel);
      connection.on('debug', msg =>
        this.client.emit('debug', `[VOICE (${this.channel.guild?.id || this.channel.id}:${connection.status})]: ${msg}`),
      );
      connection.authenticate({
        self_mute: this._mute,
        self_deaf: this._deaf,
        self_video: this._video || Boolean(this._videoLink),
      });
      this.voiceManager.connection = connection;
      this.connection = connection;

      connection.once('failed', reason => {
        this.voiceManager.connection = null;
        this.connection = null;
        reject(reason);
      });

      connection.on('error', reject);

      connection.once('authenticated', () => {
        connection.once('ready', () => {
          connection.removeListener('error', reject);
          resolve();
        });
        connection.once('disconnect', () => {
          if (this.voiceManager.connection === connection) {
            this.voiceManager.connection = null;
          }
          this.connection = null;
        });
      });
    });

    this._udp = true;
    this._video = this._video || Boolean(this._videoLink);

    if (this.client.user?.voice?.channel instanceof StageChannel) {
      await this.client.user.voice.setSuppressed(false).catch(() => null);
    }
  }

  /**
   * Ensures a Go Live stream UDP connection exists.
   * @returns {Promise<void>}
   * @private
   */
  async _ensureStreamConnection() {
    if (!this.connection) {
      await this._connectUdp();
    }
    if (this.streamConnection) return;

    this.streamConnection = await this.connection.createStreamConnection();
    this._streaming = true;
  }

  /**
   * Sends a voice state update over the gateway.
   * @param {Object} [patch={}] Voice state patch
   * @returns {void}
   * @private
   */
  _sendVoiceStateUpdate(patch = {}) {
    const data = Util.mergeDefault(
      {
        guild_id: this.channel.guild?.id ?? null,
        channel_id: this._disconnected ? null : this.channel.id,
        self_mute: this._mute,
        self_deaf: this._deaf,
        self_video: this._video,
      },
      patch,
    );

    if (data.self_video) {
      data.flags = 2;
    } else if ('self_video' in patch && !patch.self_video) {
      delete data.flags;
    }

    this.client.emit('debug', `[VOICE] VOICE_STATE_UPDATE ${JSON.stringify(data)}`);
    this.client.ws.broadcast({
      op: Opcodes.VOICE_STATE_UPDATE,
      d: data,
    });
  }

  /**
   * Sends current mute/deaf/video state.
   * @returns {Promise<void>}
   * @private
   */
  async _sendState() {
    if (this.connection) {
      await this.connection.sendVoiceStateUpdate({
        self_mute: this._mute,
        self_deaf: this._deaf,
        self_video: this._video,
      });
    } else {
      this._sendVoiceStateUpdate({
        self_mute: this._mute,
        self_deaf: this._deaf,
        self_video: this._video,
      });
    }
  }

  /**
   * Starts stream signaling on the gateway (WS-only mode).
   * @returns {Promise<void>}
   * @private
   */
  async _startStreamSignal() {
    const data = {
      type: ['DM', 'GROUP_DM'].includes(this.channel.type) ? 'call' : 'guild',
      guild_id: this.channel.guild?.id ?? null,
      channel_id: this.channel.id,
      preferred_region: this._preferredRegion,
    };

    this.client.emit('debug', `[VOICE] STREAM_CREATE ${JSON.stringify(data)}`);
    this.client.ws.broadcast({
      op: Opcodes.STREAM_CREATE,
      d: data,
    });

    this._streaming = true;

    try {
      await waitForSelfVoiceState(this.client, state => state.streaming === true, 10_000);
    } catch {
      // Discord may not always reflect streaming immediately for WS-only sessions.
    }
  }

  /**
   * Stops stream signaling on the gateway.
   * @returns {Promise<void>}
   * @private
   */
  async _stopStreamSignal() {
    if (!this._streaming && !this.streamConnection) return;

    this.client.emit('debug', `[VOICE] STREAM_DELETE ${this.streamKey}`);
    this.client.ws.broadcast({
      op: Opcodes.STREAM_DELETE,
      d: { stream_key: this.streamKey },
    });

    this._streaming = false;

    try {
      await waitForSelfVoiceState(this.client, state => !state.streaming, 5_000);
    } catch {
      // Best effort cleanup.
    }
  }

  /**
   * Stops Go Live media dispatchers without leaving voice.
   * @private
   */
  _stopStreamMedia() {
    this._positionMs = this._getStreamPositionMs();
    this._streamVideoDispatcher?.destroy();
    this._streamAudioDispatcher?.destroy();
    this._voiceAudioDispatcher?.destroy();
    this._streamVideoDispatcher = null;
    this._streamAudioDispatcher = null;
    this._voiceAudioDispatcher = null;
  }

  /**
   * Stops camera media dispatchers without leaving voice.
   * @private
   */
  _stopVideoMedia() {
    this._cameraVideoDispatcher?.destroy();
    this._cameraAudioDispatcher?.destroy();
    this._cameraVideoDispatcher = null;
    this._cameraAudioDispatcher = null;
  }

  /**
   * Current Go Live playback position in ms.
   * @returns {number}
   * @private
   */
  _getStreamPositionMs() {
    if (!this._streamVideoDispatcher) return this._positionMs;
    return Math.max(0, this._streamVideoDispatcher.totalStreamTime - this._streamVideoDispatcher.pausedTime);
  }

  /**
   * Builds shared ffmpeg play options.
   * @param {string} url Media url/path
   * @param {number} seekSec Seek offset in seconds
   * @returns {{ videoOptions: object, audioOptions: object }}
   * @private
   */
  _mediaOptions(url, seekSec = 0) {
    const fps = this._fps;
    const height = this._height;
    const width = this._width ?? Math.round((height * 16) / 9);
    const videoOptions = {
      fps,
      bitrate: this._bitrate,
      seek: seekSec,
      presetH26x: 'ultrafast',
      outputFFmpegArgs: [
        '-pix_fmt',
        'yuv420p',
        '-g',
        String(fps),
        '-keyint_min',
        String(fps),
        '-sc_threshold',
        '0',
        '-force_key_frames',
        'expr:gte(t,n_forced*1)',
        '-vf',
        `scale=-2:${height}`,
      ],
    };

    if (typeof url === 'string' && !url.startsWith('http')) {
      videoOptions.inputFFmpegArgs = ['-re'];
    } else {
      videoOptions.inputFFmpegArgs = ['-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1'];
    }

    const audioOptions = {
      type: 'unknown',
      seek: seekSec,
      bitrate: this._audioBitrate,
      inputFFmpegArgs: videoOptions.inputFFmpegArgs.slice(),
    };

    return { videoOptions, audioOptions, width, height, fps };
  }

  /**
   * Plays Go Live media over the stream UDP connection.
   * @param {number} [seekSec=0] Seek offset
   * @private
   */
  _playStreamMedia(seekSec = 0) {
    if (!this._streamLink || !this.streamConnection) return;

    this._stopStreamMedia();
    const { videoOptions, audioOptions, width, height, fps } = this._mediaOptions(this._streamLink, seekSec);
    this.streamConnection.videoAttributes = { width, height, fps };

    this._streamVideoDispatcher = this.streamConnection.playVideo(this._streamLink, videoOptions);

    if (this._audio) {
      this._voiceAudioDispatcher = this.connection.playAudio(this._streamLink, audioOptions);
      this._streamAudioDispatcher = this.streamConnection.playAudio(this._streamLink, audioOptions);
      this._streamAudioDispatcher.setSyncVideoDispatcher(this._streamVideoDispatcher);
    }

    this._paused = false;
    this._positionMs = seekSec * 1000;
    this._streamVideoDispatcher.once('finish', () => {
      this._positionMs = 0;
    });
  }

  /**
   * Plays camera media over the voice UDP connection.
   * @param {number} [seekSec=0] Seek offset
   * @private
   */
  _playVideoMedia(seekSec = 0) {
    if (!this._videoLink || !this.connection) return;

    this._stopVideoMedia();
    const { videoOptions, audioOptions, width, height, fps } = this._mediaOptions(this._videoLink, seekSec);
    this.connection.videoAttributes = { width, height, fps };

    this._cameraVideoDispatcher = this.connection.playVideo(this._videoLink, videoOptions);

    if (this._audio && !this._streamLink) {
      this._cameraAudioDispatcher = this.connection.playAudio(this._videoLink, audioOptions);
      if (typeof this._cameraAudioDispatcher.setSyncVideoDispatcher === 'function') {
        this._cameraAudioDispatcher.setSyncVideoDispatcher(this._cameraVideoDispatcher);
      }
    }
  }

  /**
   * Upgrades a WS-only session to UDP when a media link is set.
   * @returns {Promise<void>}
   * @private
   */
  async _upgradeToUdp() {
    if (this._udp && this.connection) return;

    await this._connectUdp();
    if (this._streaming || this._streamLink) {
      await this._ensureStreamConnection();
    }
  }

  /**
   * Sets the self mute state.
   * @param {boolean} [mute=true] Whether to mute
   * @returns {Promise<this>}
   */
  async setMute(mute = true) {
    this._mute = Boolean(mute);
    await this._sendState();
    await waitForSelfVoiceState(this.client, state => state.selfMute === this._mute).catch(() => null);
    return this;
  }

  /**
   * Sets the self deaf state.
   * @param {boolean} [deaf=true] Whether to deafen
   * @returns {Promise<this>}
   */
  async setDeaf(deaf = true) {
    this._deaf = Boolean(deaf);
    await this._sendState();
    await waitForSelfVoiceState(this.client, state => state.selfDeaf === this._deaf).catch(() => null);
    return this;
  }

  /**
   * Sets the Go Live stream state.
   * @param {boolean} [stream=true] Whether to stream
   * @returns {Promise<this>}
   */
  async setStream(stream = true) {
    stream = Boolean(stream);

    if (stream) {
      if (this._udp || this._streamLink) {
        await this._ensureStreamConnection();
        if (this._streamLink) this._playStreamMedia(this._positionMs / 1000);
      } else {
        await this._startStreamSignal();
      }
    } else {
      this._stopStreamMedia();
      if (this.streamConnection) {
        this.streamConnection.disconnect();
        this.streamConnection = null;
      } else {
        await this._stopStreamSignal();
      }
    }

    return this;
  }

  /**
   * Sets or changes the Go Live media link (UDP).
   * @param {string|null} link Media URL or file path
   * @returns {Promise<this>}
   */
  async setStreamLink(link) {
    this._streamLink = link || null;

    if (!this._streamLink) {
      this._stopStreamMedia();
      return this;
    }

    await this._upgradeToUdp();
    await this._ensureStreamConnection();
    this._playStreamMedia(0);
    return this;
  }

  /**
   * Sets the self video (camera) state.
   * @param {boolean} [video=true] Whether to enable camera
   * @returns {Promise<this>}
   */
  async setVideo(video = true) {
    this._video = Boolean(video);
    await this._sendState();

    if (!this._video) {
      this._stopVideoMedia();
    } else if (this._videoLink && this.connection) {
      this._playVideoMedia(0);
    }

    await waitForSelfVoiceState(this.client, state => Boolean(state.selfVideo) === this._video).catch(() => null);
    return this;
  }

  /**
   * Sets or changes the camera media link (UDP).
   * @param {string|null} link Media URL or file path
   * @returns {Promise<this>}
   */
  async setVideoLink(link) {
    this._videoLink = link || null;

    if (!this._videoLink) {
      this._stopVideoMedia();
      return this;
    }

    this._video = true;
    await this._upgradeToUdp();
    await this._sendState();
    this._playVideoMedia(0);
    return this;
  }

  /**
   * Pauses Go Live (and camera) media playback.
   * @returns {this}
   */
  pauseStream() {
    if (this._paused) return this;

    this._positionMs = this._getStreamPositionMs();
    this._streamVideoDispatcher?.pause();
    this._streamAudioDispatcher?.pause(true);
    this._voiceAudioDispatcher?.pause(true);
    this._cameraVideoDispatcher?.pause();
    this._cameraAudioDispatcher?.pause(true);
    this.streamConnection?.sendScreenshareState(true);
    this._paused = true;
    return this;
  }

  /**
   * Resumes Go Live (and camera) media playback.
   * @returns {this}
   */
  unpauseStream() {
    if (!this._paused) return this;

    this.streamConnection?.sendScreenshareState(false);
    this._streamVideoDispatcher?.resume();
    this._streamAudioDispatcher?.resume();
    this._voiceAudioDispatcher?.resume();
    this._cameraVideoDispatcher?.resume();
    this._cameraAudioDispatcher?.resume();
    this._paused = false;
    return this;
  }

  /**
   * Seeks Go Live media to a position in milliseconds.
   * @param {number} ms Position in milliseconds
   * @example voice.streamTime(1000 * 60 + 1000) // 1m01s
   * @returns {this}
   */
  streamTime(ms) {
    const seekMs = Math.max(0, Number(ms) || 0);
    this._positionMs = seekMs;
    if (this._streamLink && this.streamConnection) {
      this._playStreamMedia(seekMs / 1000);
    }
    if (this._videoLink && this.connection) {
      this._playVideoMedia(seekMs / 1000);
    }
    return this;
  }

  /**
   * Leaves the voice channel and clears stream/video state.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this._disconnected) return;
    this._disconnected = true;

    this._stopStreamMedia();
    this._stopVideoMedia();

    if (this.streamConnection) {
      this.streamConnection.disconnect();
      this.streamConnection = null;
    }

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
      if (this.voiceManager.connection) this.voiceManager.connection = null;
    } else {
      await this._stopStreamSignal();
      this._sendVoiceStateUpdate({
        channel_id: null,
        self_mute: false,
        self_deaf: false,
        self_video: false,
      });

      try {
        await waitForSelfVoiceState(this.client, state => !state.channelId, 10_000);
      } catch {
        // Best effort cleanup.
      }
    }

    if (this.voiceManager.session === this) {
      this.voiceManager.session = null;
    }
  }
}

module.exports = VoiceSession;
module.exports.getStreamKey = getStreamKey;
module.exports.normalizeData = normalizeData;
module.exports.waitForSelfVoiceState = waitForSelfVoiceState;
