'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const {
  Streamer,
  prepareStream,
  playStream,
  Encoders,
} = require('@dank074/discord-video-stream');
const StreamSession = require('./StreamSession');
const StageChannel = require('../../structures/StageChannel');

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @type {'amf' | 'nvenc' | 'software' | null} */
let _cachedEncoder = null;

function detectHwEncoder() {
  if (_cachedEncoder) return Promise.resolve(_cachedEncoder);
  return new Promise(resolve => {
    ffmpeg.getAvailableEncoders((err, encoders) => {
      if (err || !encoders) {
        _cachedEncoder = 'software';
        resolve('software');
        return;
      }
      if (encoders.h264_amf) {
        _cachedEncoder = 'amf';
        resolve('amf');
        return;
      }
      if (encoders.h264_nvenc) {
        const proc = spawn('ffmpeg', [
          '-hide_banner', '-loglevel', 'error',
          '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.04',
          '-c:v', 'h264_nvenc', '-f', 'null', '-',
        ]);
        proc.on('close', code => {
          if (code === 0) {
            _cachedEncoder = 'nvenc';
            resolve('nvenc');
          } else {
            _cachedEncoder = 'software';
            resolve('software');
          }
        });
        proc.on('error', () => {
          _cachedEncoder = 'software';
          resolve('software');
        });
        return;
      }
      _cachedEncoder = 'software';
      resolve('software');
    });
  });
}

/**
 * Go Live WebRTC — même approche que discord-livestream-selfbot :
 * Streamer.joinVoice + prepareStream + playStream
 * @extends {EventEmitter}
 */
class WebRtcStreamSession extends EventEmitter {
  static resolveUrl = StreamSession.resolveUrl;

  /**
   * @param {import('../Client')} client
   * @param {import('./StreamSession').StartStreamOptions} options
   */
  constructor(client, options) {
    super();
    this.client = client;
    this.options = options;
    this.streamer = new Streamer(client);
    this._abort = new AbortController();
    this._ffmpegCommand = null;
    this._playPromise = null;
    this._started = false;
    this._running = false;
    this._paused = false;
    this._stopped = false;
    this._positionMs = 0;
    this._runStartWall = 0;
  }

  _getPositionMs() {
    if (!this._running) return this._positionMs;
    return this._positionMs + (Date.now() - this._runStartWall);
  }

  async _pickEncoder() {
    const { preset = 'ultrafast', encoder = 'auto' } = this.options;
    let mode = encoder;
    if (encoder === 'auto') mode = await detectHwEncoder();

    if (mode === 'nvenc') {
      console.log('[stream] encodeur: h264_nvenc');
      return Encoders.nvenc({ preset: 'p1' });
    }
    if (mode === 'amf') {
      console.log('[stream] encodeur: h264_amf');
      return () => ({
        H264: {
          name: 'h264_amf',
          options: ['-usage', 'transcoding', '-quality', 'speed'],
        },
        H265: {
          name: 'hevc_amf',
          options: ['-usage', 'transcoding', '-quality', 'speed'],
        },
      });
    }
    console.log('[stream] encodeur: libx264');
    return Encoders.software({
      x264: { preset, tune: 'zerolatency' },
    });
  }

  async _buildPrepareOptions(seekSec = 0) {
    const {
      fps = 60,
      height,
      width,
      bitrate = 4500,
      bitrateMax,
      audioBitrate = 128,
      hardwareAcceleratedDecoding = true,
      audio,
      noTranscoding = false,
    } = this.options;

    if (noTranscoding) {
      console.log('[stream] mode copie vidéo (pas de ré-encodage)');
      return {
        noTranscoding: true,
        bitrateAudio: audioBitrate,
        includeAudio: audio !== false,
        hardwareAcceleratedDecoding: false,
        minimizeLatency: true,
        customInputOptions: seekSec > 0 ? [`-ss ${String(seekSec)}`] : [],
        customFfmpegFlags: [],
      };
    }

    const gop = String(fps);

    return {
      encoder: await this._pickEncoder(),
      height,
      width,
      frameRate: fps,
      bitrateVideo: bitrate,
      bitrateVideoMax: bitrateMax ?? Math.round(bitrate * 1.5),
      bitrateAudio: audioBitrate,
      includeAudio: audio !== false,
      hardwareAcceleratedDecoding,
      minimizeLatency: true,
      customInputOptions: seekSec > 0 ? [`-ss ${String(seekSec)}`] : [],
      customFfmpegFlags: [
        '-g', gop,
        '-keyint_min', gop,
        '-sc_threshold', '0',
        '-threads', '0',
      ],
    };
  }

  async _disconnectLegacyVoice() {
    const conn = this.client.voice?.connection;
    if (conn) {
      conn.disconnect();
      this.client.voice.connection = null;
      await sleep(800);
    }
  }

  async _joinVoice() {
    const { guildId, channelId } = this.options;

    if (this.streamer.voiceConnection) {
      this.streamer.leaveVoice();
      await sleep(1000);
    }

    await this._disconnectLegacyVoice();

    const vc = this.streamer.voiceConnection;
    if (
      !vc ||
      vc.guildId !== guildId ||
      vc.channelId !== channelId
    ) {
      await this.streamer.joinVoice(guildId, channelId);
    }

    if (this.client.user?.voice?.channel instanceof StageChannel) {
      await this.client.user.voice.setSuppressed(false);
    }
  }

  async _run(url, signal, seekSec = 0) {
    const prepareOpts = await this._buildPrepareOptions(seekSec);
    const { command, output } = prepareStream(url, prepareOpts, signal);
    this._ffmpegCommand = command;

    command.on('start', cmd => this.emit('debug', `[ffmpeg] ${cmd}`));
    command.on('stderr', line => this.emit('debug', String(line)));
    command.on('error', (err, _stdout, stderr) => {
      if (signal.aborted) return;
      this.emit('error', new Error(stderr ? `${err.message}\n${stderr}` : err.message));
    });

    this._running = true;
    this._paused = false;
    this._stopped = false;
    this._runStartWall = Date.now();

    let playOptions;
    if (this.options.noTranscoding) {
      console.log('[stream] envoi à la résolution/fps natifs de la source (WebRTC)');
      playOptions = {};
    } else {
      const { height = 720, width = 1280, fps = 60 } = this.options;
      console.log(`[stream] envoi ${width}x${height} @ ${fps}fps (WebRTC)`);
      playOptions = { width, height, frameRate: fps };
    }
    this.emit('playing');

    this._playPromise = playStream(output, this.streamer, playOptions, signal);

    this._playPromise
      .then(() => {
        this._running = false;
        this._ffmpegCommand = null;
        if (!signal.aborted) {
          this._positionMs = 0;
          this.emit('finish');
        }
      })
      .catch(err => {
        this._running = false;
        this._ffmpegCommand = null;
        if (signal.aborted || err?.name === 'AbortError') return;
        this.emit('error', err);
      });

    return this._playPromise;
  }

  async start() {
    const { url } = this.options;
    await this._joinVoice();
    this._started = true;

    const playing = new Promise((resolve, reject) => {
      this.once('playing', resolve);
      this.once('error', reject);
    });

    void this._run(url, this._abort.signal).catch(err => this.emit('error', err));
    await playing;
  }

  pause() {
    if (!this._running || this._paused || this._stopped) return;
    this._positionMs = this._getPositionMs();
    this._paused = true;
    this._running = false;
    this._ffmpegCommand?.kill?.('SIGTERM');
    this._ffmpegCommand = null;
    this.streamer.stopStream();
    this._abort.abort();
    this._abort = new AbortController();
    console.log(`[stream] pause à ${(this._positionMs / 1000).toFixed(1)}s`);
  }

  async resume() {
    if (this._stopped) {
      this._stopped = false;
      await this._run(this.options.url, this._abort.signal, this._positionMs / 1000);
      return;
    }
    if (!this._paused) return;
    this._paused = false;
    const seekSec = this._positionMs / 1000;
    console.log(`[stream] reprise à ${seekSec.toFixed(1)}s`);
    await this._run(this.options.url, this._abort.signal, seekSec);
  }

  stop() {
    if (!this._running && !this._paused) return;
    this._positionMs = this._getPositionMs();
    this._stopped = true;
    this._paused = false;
    this._running = false;
    this._ffmpegCommand?.kill?.('SIGTERM');
    this._ffmpegCommand = null;
    this.streamer.stopStream();
    this._abort.abort();
    this._abort = new AbortController();
    console.log(`[stream] stop à ${(this._positionMs / 1000).toFixed(1)}s`);
  }

  async replay() {
    const seekSec = (this._running ? this._getPositionMs() : this._positionMs) / 1000;
    if (this._running || this._paused) this.stop();
    this._stopped = false;
    await this._run(this.options.url, this._abort.signal, seekSec);
  }

  disconnect() {
    this.stop();
    if (this._started) this.streamer.leaveVoice();
    this._started = false;
  }
}

module.exports = WebRtcStreamSession;
