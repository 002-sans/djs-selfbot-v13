'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('events');
const StageChannel = require('../../structures/StageChannel');

/**
 * Active screenshare session returned by {@link Client#startStream}.
 * @extends {EventEmitter}
 */
class StreamSession extends EventEmitter {
  /**
   * Downloads an HTTP(S) video to a temp file (recommended on VPS).
   * @param {string} url Remote video URL
   * @returns {Promise<string>} Local file path
   */
  static async resolveUrl(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`STREAM_URL_HTTP_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1024) throw new Error('STREAM_URL_INVALID');
    const tmpPath = path.join(os.tmpdir(), `djs-stream-${Date.now()}.mp4`);
    fs.writeFileSync(tmpPath, buffer);
    console.log(`[stream] vidéo téléchargée: ${tmpPath} (${(buffer.length / 1024 / 1024).toFixed(2)} Mo)`);
    return tmpPath;
  }
  /**
   * @param {import('../Client')} client Discord client
   * @param {import('./VoiceConnection')} voiceConnection Voice connection
   * @param {import('./VoiceConnection').StreamConnection} streamConnection Stream connection
   * @param {StartStreamOptions} options Stream options
   */
  constructor(client, voiceConnection, streamConnection, options) {
    super();
    this.client = client;
    this.voiceConnection = voiceConnection;
    this.streamConnection = streamConnection;
    this.options = options;
    this.videoDispatcher = null;
    this.audioDispatcher = null;
    this.voiceAudioDispatcher = null;
    this._positionMs = 0;
    this._stopped = false;

    const onError = err => this.emit('error', err);
    streamConnection.on('error', onError);
    voiceConnection.on('error', onError);
  }

  _getPositionMs() {
    if (!this.videoDispatcher) return this._positionMs;
    return Math.max(0, this.videoDispatcher.totalStreamTime - this.videoDispatcher.pausedTime);
  }

  /**
   * Starts playback on the stream connection.
   */
  start() {
    if (this.client.user?.voice?.channel instanceof StageChannel) {
      void this.client.user.voice.setSuppressed(false);
    }
    return this._play();
  }

  _play(seek = 0) {
    const { url, fps, height, width, bitrate, audioBitrate } = this.options;
    const streamFps = fps ?? 30;
    const streamHeight = height ?? 720;
    this.streamConnection.videoAttributes = {
      width: width ?? Math.round((streamHeight * 16) / 9),
      height: streamHeight,
      fps: streamFps,
    };
    const videoOptions = {
      fps: streamFps,
      bitrate,
      seek,
      presetH26x: this.options.preset || 'ultrafast',
      outputFFmpegArgs: [
        '-pix_fmt',
        'yuv420p',
        '-g',
        String(streamFps),
        '-keyint_min',
        String(streamFps),
        '-sc_threshold',
        '0',
        '-force_key_frames',
        'expr:gte(t,n_forced*1)',
      ],
    };

    if (height) {
      videoOptions.outputFFmpegArgs.unshift('-vf', `scale=-2:${height}`);
    }

    if (!url.startsWith('http')) {
      videoOptions.inputFFmpegArgs = ['-re'];
    } else {
      videoOptions.inputFFmpegArgs = ['-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1'];
    }

    console.log(`[stream] lecture ${width ?? '?'}x${streamHeight} @ ${streamFps}fps (UDP)`);

    this.videoDispatcher = this.streamConnection.playVideo(url, videoOptions);

    if (this.options.audio !== false) {
      const audioOptions = {
        type: 'unknown',
        seek,
        bitrate: audioBitrate ?? 128,
      };
      if (!url.startsWith('http')) {
        audioOptions.inputFFmpegArgs = ['-re'];
      } else {
        audioOptions.inputFFmpegArgs = ['-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1'];
      }
      this.voiceAudioDispatcher = this.voiceConnection.playAudio(url, audioOptions);
      this.audioDispatcher = this.streamConnection.playAudio(url, audioOptions);
      this.audioDispatcher.setSyncVideoDispatcher(this.videoDispatcher);
    }

    this._stopped = false;
    this.videoDispatcher.once('finish', () => {
      this._positionMs = 0;
      this.emit('finish');
    });

    return this.videoDispatcher;
  }

  /**
   * Pauses video and audio playback.
   */
  pause() {
    this.videoDispatcher?.pause();
    this.audioDispatcher?.pause(true);
    this.voiceAudioDispatcher?.pause(true);
    this.streamConnection.sendScreenshareState(true);
  }

  /**
   * Resumes video and audio playback.
   */
  resume() {
    this.streamConnection.sendScreenshareState(false);
    this.videoDispatcher?.resume();
    this.audioDispatcher?.resume();
    this.voiceAudioDispatcher?.resume();
  }

  /**
   * Stops playback while keeping voice/stream connections.
   */
  stop() {
    this._positionMs = this._getPositionMs();
    this._stopped = true;
    this.videoDispatcher?.destroy();
    this.audioDispatcher?.destroy();
    this.voiceAudioDispatcher?.destroy();
    this.videoDispatcher = null;
    this.audioDispatcher = null;
    this.voiceAudioDispatcher = null;
  }

  /**
   * Resumes playback from the last position.
   * @returns {import('./dispatcher/VideoDispatcher')}
   */
  replay() {
    const seekSec = (this._stopped ? this._positionMs : this._getPositionMs()) / 1000;
    this.stop();
    return this._play(seekSec);
  }

  /**
   * Stops playback and disconnects from voice and stream.
   */
  disconnect() {
    this.stop();
    this.streamConnection.disconnect();
    this.voiceConnection.disconnect();
  }
}

module.exports = StreamSession;

/**
 * @typedef {Object} StartStreamOptions
 * @property {Snowflake} guildId Guild id
 * @property {Snowflake} channelId Voice channel id
 * @property {string} url Video URL or file path
 * @property {number} [fps=30] Video framerate
 * @property {number} [height] Output height (width auto-scaled)
 * @property {number} [width] Video width sent to Discord (default: 16:9 from height)
 * @property {number} [bitrate=2000] Video bitrate in kbps
 * @property {number} [audioBitrate=128] Audio bitrate in kbps
 * @property {'H264' | 'VP8'} [videoCodec='H264'] Video codec
 * @property {string} [preset='ultrafast'] x264 preset
 * @property {boolean} [audio=true] Whether to play audio
 * @property {boolean} [video=false] Enable webcam (false = screenshare only)
 * @property {boolean} [downloadHttp=true] Download HTTP URLs locally before playback
 * @property {number} [bitrateMax] Max video bitrate in kbps
 * @property {boolean} [livestream=false] Enable readrateInitialBurst (live sources)
 * @property {'auto' | 'amf' | 'nvenc' | 'qsv' | 'software'} [encoder='auto'] Video encoder
 * @property {boolean} [hardwareAcceleratedDecoding=true] Use GPU decoding (-hwaccel auto)
 * @property {string} [nvencPreset='p1'] NVENC preset (p1 = lowest latency)
 * @property {boolean} [preEncode=true] Pré-encode en local avant lecture (fluidité)
 * @property {boolean} [goLive=false] WebRTC Go Live (sinon UDP classique, plus stable)
 */
