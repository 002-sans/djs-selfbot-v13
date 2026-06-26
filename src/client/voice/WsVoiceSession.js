'use strict';

const { Events, Opcodes } = require('../../util/Constants');
const Util = require('../../util/Util');

/**
 * @typedef {Object} WsVoiceSessionOptions
 * @property {boolean} [mute=false] Self mute
 * @property {boolean} [deaf=false] Self deaf
 * @property {boolean} [video=false] Self video
 * @property {boolean} [stream=false] Start a stream signal (Go Live)
 * @property {string} [preferredRegion=null] Preferred region for streams
 */

/**
 * Normalizes WS voice session options.
 * @param {WsVoiceSessionOptions} [options={}] Options
 * @returns {Required<Omit<WsVoiceSessionOptions, 'preferredRegion'>> & { preferredRegion: string | null }}
 */
function normalizeOptions(options = {}) {
  return {
    mute: options.mute ?? options.selfMute ?? false,
    deaf: options.deaf ?? options.selfDeaf ?? false,
    video: options.video ?? options.selfVideo ?? false,
    stream: options.stream ?? false,
    preferredRegion: options.preferredRegion ?? options.preferred_region ?? null,
  };
}

/**
 * Builds a Discord stream key for a voice channel.
 * @param {import('../../structures/Channel')} channel Voice channel
 * @param {import('../../util/Snowflake')} userId User id
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
 * @param {import('../Client')} client Discord client
 * @param {(voiceState: import('../../structures/VoiceState')) => boolean} predicate Predicate
 * @param {number} [timeout=10_000] Timeout in milliseconds
 * @returns {Promise<import('../../structures/VoiceState')>}
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
 * Lightweight gateway-only voice session (no UDP voice connection).
 */
class WsVoiceSession {
  /**
   * @param {import('./ClientVoiceManager')} voiceManager Voice manager
   * @param {import('../../structures/Channel')} channel Voice channel
   * @param {WsVoiceSessionOptions} [options={}] Initial session options
   */
  constructor(voiceManager, channel, options = {}) {
    this.voiceManager = voiceManager;
    this.channel = channel;
    this.client = voiceManager.client;

    const normalized = normalizeOptions(options);
    this._mute = normalized.mute;
    this._deaf = normalized.deaf;
    this._video = normalized.video;
    this._streaming = normalized.stream;
    this._preferredRegion = normalized.preferredRegion;
    this._disconnected = false;
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

    this.client.emit('debug', `[WS-VOICE] VOICE_STATE_UPDATE ${JSON.stringify(data)}`);
    this.client.ws.broadcast({
      op: Opcodes.VOICE_STATE_UPDATE,
      d: data,
    });
  }

  /**
   * Starts stream signaling on the gateway.
   * @param {string|null} [preferredRegion=null] Preferred region
   * @returns {Promise<void>}
   * @private
   */
  async _startStream(preferredRegion = this._preferredRegion) {
    const data = {
      type: ['DM', 'GROUP_DM'].includes(this.channel.type) ? 'call' : 'guild',
      guild_id: this.channel.guild?.id ?? null,
      channel_id: this.channel.id,
      preferred_region: preferredRegion,
    };

    this.client.emit('debug', `[WS-VOICE] STREAM_CREATE ${JSON.stringify(data)}`);
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
  async _stopStream() {
    if (!this._streaming) return;

    this.client.emit('debug', `[WS-VOICE] STREAM_DELETE ${this.streamKey}`);
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
   * Sets the self mute state.
   * @param {boolean} [mute=true] Whether to mute
   * @returns {Promise<this>}
   */
  async setMute(mute = true) {
    this._mute = Boolean(mute);
    this._sendVoiceStateUpdate({ self_mute: this._mute });
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
    this._sendVoiceStateUpdate({ self_deaf: this._deaf });
    await waitForSelfVoiceState(this.client, state => state.selfDeaf === this._deaf).catch(() => null);
    return this;
  }

  /**
   * Sets the self video state.
   * @param {boolean} [video=true] Whether to enable camera
   * @returns {Promise<this>}
   */
  async setVideo(video = true) {
    this._video = Boolean(video);
    this._sendVoiceStateUpdate({ self_video: this._video });
    await waitForSelfVoiceState(this.client, state => Boolean(state.selfVideo) === this._video).catch(() => null);
    return this;
  }

  /**
   * Sets the stream (Go Live) state.
   * @param {boolean} [stream=true] Whether to stream
   * @returns {Promise<this>}
   */
  async setStream(stream = true) {
    if (stream) {
      await this._startStream();
    } else {
      await this._stopStream();
    }
    return this;
  }

  /**
   * Updates multiple voice session options at once.
   * @param {WsVoiceSessionOptions} options Options to apply
   * @returns {Promise<this>}
   */
  async edit(options = {}) {
    const normalized = normalizeOptions(options);
    const voiceChanged =
      normalized.mute !== this._mute ||
      normalized.deaf !== this._deaf ||
      normalized.video !== this._video;

    if (typeof normalized.preferredRegion === 'string' || normalized.preferredRegion === null) {
      this._preferredRegion = normalized.preferredRegion;
    }

    this._mute = normalized.mute;
    this._deaf = normalized.deaf;
    this._video = normalized.video;

    if (voiceChanged) {
      this._sendVoiceStateUpdate({
        self_mute: this._mute,
        self_deaf: this._deaf,
        self_video: this._video,
      });
      await waitForSelfVoiceState(
        this.client,
        state =>
          state.selfMute === this._mute &&
          state.selfDeaf === this._deaf &&
          Boolean(state.selfVideo) === this._video,
      ).catch(() => null);
    }

    if (normalized.stream !== this._streaming) {
      await this.setStream(normalized.stream);
    }

    return this;
  }

  /**
   * Leaves the voice channel and clears stream state.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this._disconnected) return;

    this._disconnected = true;
    await this._stopStream();

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

    if (this.voiceManager.wsSession === this) {
      this.voiceManager.wsSession = null;
    }
  }
}

module.exports = WsVoiceSession;
module.exports.getStreamKey = getStreamKey;
module.exports.normalizeOptions = normalizeOptions;
module.exports.waitForSelfVoiceState = waitForSelfVoiceState;
