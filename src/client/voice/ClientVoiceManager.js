'use strict';

const VoiceConnection = require('./VoiceConnection');
const WsVoiceSession = require('./WsVoiceSession');
const { normalizeOptions, waitForSelfVoiceState } = require('./WsVoiceSession');
const { Error } = require('../../errors');
const { Events, VoiceStatus, Opcodes } = require('../../util/Constants');

/**
 * Manages voice connections for the client
 * Feat: Support both lib & djs/voice
 */
class ClientVoiceManager {
  constructor(client) {
    /**
     * The client that instantiated this voice manager
     * @type {Client}
     * @readonly
     * @name ClientVoiceManager#client
     */
    Object.defineProperty(this, 'client', { value: client });

    /**
     * A current connection objects
     * @type {?VoiceConnection}
     */
    this.connection = null;

    /**
     * A lightweight gateway-only voice session
     * @type {?WsVoiceSession}
     */
    this.wsSession = null;

    /**
     * Maps guild ids to voice adapters created for use with @discordjs/voice.
     * @type {Map<Snowflake, Object>}
     */
    this.adapters = new Map();

    client.on(Events.SHARD_DISCONNECT, (_, shardId) => {
      for (const [guildId, adapter] of this.adapters.entries()) {
        if (client.guilds.cache.get(guildId)?.shardId === shardId) {
          // Because it has 1 shard => adapter.destroy();
        }
        adapter.destroy();
      }
    });
  }

  onVoiceServer(payload) {
    const { guild_id, channel_id, token, endpoint } = payload;
    this.client.emit(
      'debug',
      `[VOICE] voiceServer ${channel_id ? 'channel' : 'guild'}: ${
        channel_id || guild_id
      } token: ${token} endpoint: ${endpoint}`,
    );
    const connection = this.connection;
    if (connection) connection.setTokenAndEndpoint(token, endpoint);
    // Djs / voice
    if (payload.guild_id) {
      this.adapters.get(payload.guild_id)?.onVoiceServerUpdate(payload);
    } else {
      this.adapters.get(payload.channel_id)?.onVoiceServerUpdate(payload);
    }
  }

  onVoiceStateUpdate(payload) {
    const { guild_id, session_id, channel_id } = payload;
    if (payload.user_id !== this.client.user?.id) return;
    // @discordjs/voice
    if (payload.guild_id && payload.session_id && payload.user_id === this.client.user?.id) {
      this.adapters.get(payload.guild_id)?.onVoiceStateUpdate(payload);
    } else if (payload.channel_id && payload.session_id && payload.user_id === this.client.user?.id) {
      this.adapters.get(payload.channel_id)?.onVoiceStateUpdate(payload);
    }
    // Main lib
    const connection = this.connection;
    this.client.emit('debug', `[VOICE] connection? ${!!connection}, ${guild_id} ${session_id} ${channel_id}`);
    if (!connection) return;
    if (!channel_id) {
      if (connection.status === VoiceStatus.AUTHENTICATING || connection.status === VoiceStatus.CONNECTING) {
        return;
      }
      connection._disconnect();
      this.connection = null;
      return;
    }
    const channel = this.client.channels.cache.get(channel_id);
    if (channel) {
      connection.channel = channel;
      connection.setSessionId(session_id);
    } else {
      this.client.emit('debug', `[VOICE] disconnecting from guild ${guild_id} as channel ${channel_id} is uncached`);
      connection.disconnect();
    }
  }

  /**
   * @property {boolean} [selfMute=false]
   * @property {boolean} [selfDeaf=false]
   * @property {boolean} [selfVideo=false]
   * @property {VideoCodec} [videoCodec='H264']
   * @typedef {Object} JoinChannelConfig
   */

  /**
   * Clears stale voice/stream state before joining a channel.
   * @param {VoiceChannel} channel The channel to join
   * @returns {Promise<void>}
   * @private
   */
  preJoinCleanup(channel) {
    return new Promise(resolve => {
      const guild = channel.guild;
      if (!guild) {
        resolve();
        return;
      }

      const userId = this.client.user?.id;
      const voiceState = guild.voiceStates.cache.get(userId);
      const inVoice = Boolean(voiceState?.channelId);
      const isStreaming = Boolean(voiceState?.streaming);

      if (this.connection) {
        this.connection.disconnect();
        this.connection = null;
      }

      if (this.wsSession) {
        this.wsSession.disconnect().catch(() => null);
        this.wsSession = null;
      }

      if (!inVoice && !isStreaming) {
        resolve();
        return;
      }

      const streamKey = `guild:${guild.id}:${voiceState.channelId}:${userId}`;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.client.removeListener(Events.VOICE_STATE_UPDATE, onState);
        setTimeout(resolve, 500).unref();
      };

      const onState = (_old, newState) => {
        if (newState.id !== userId || newState.guild?.id !== guild.id) return;
        if (!newState.channelId && !newState.streaming) done();
      };

      this.client.on(Events.VOICE_STATE_UPDATE, onState);
      this.client.emit('debug', `[VOICE] preJoinCleanup: quitte le salon ${voiceState.channelId}`);

      if (isStreaming) {
        this.client.ws.broadcast({
          op: Opcodes.STREAM_DELETE,
          d: { stream_key: streamKey },
        });
      }

      this.client.ws.broadcast({
        op: Opcodes.VOICE_STATE_UPDATE,
        d: {
          guild_id: guild.id,
          channel_id: null,
          self_mute: false,
          self_deaf: false,
        },
      });

      setTimeout(done, 5000).unref();
    });
  }

  /**
   * Force quitter vocal + stream (session stale / erreur 4006).
   * @param {import('../../structures/VoiceChannel') | import('../../structures/StageChannel')} channel
   * @returns {Promise<void>}
   */
  resetVoiceSession(channel) {
    return new Promise(resolve => {
      if (this.wsSession) {
        this.wsSession.disconnect().catch(() => null);
        this.wsSession = null;
      }

      if (this.connection) {
        if (this.connection.streamConnection) {
          this.connection.streamConnection.disconnect();
          this.connection.streamConnection = null;
        }
        this.connection.disconnect();
        this.connection = null;
      }

      const guild = channel.guild;
      if (!guild) {
        setTimeout(resolve, 1000).unref();
        return;
      }

      const userId = this.client.user?.id;
      const voiceState = guild.voiceStates.cache.get(userId);
      const channelId = voiceState?.channelId ?? channel.id;
      const streamKey = `guild:${guild.id}:${channelId}:${userId}`;

      this.client.ws.broadcast({
        op: Opcodes.STREAM_DELETE,
        d: { stream_key: streamKey },
      });
      this.client.ws.broadcast({
        op: Opcodes.VOICE_STATE_UPDATE,
        d: {
          guild_id: guild.id,
          channel_id: null,
          self_mute: false,
          self_deaf: false,
        },
      });

      this.client.emit('debug', '[VOICE] resetVoiceSession: vocal et stream réinitialisés');
      setTimeout(resolve, 2500).unref();
    });
  }

  /**
   * @param {import('../../structures/VoiceChannel') | import('../../structures/StageChannel')} channel
   * @param {object} [config]
   * @param {number} [maxAttempts=3]
   * @returns {Promise<VoiceConnection>}
   */
  async joinChannelWithRetry(channel, config = {}, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[stream] reconnexion vocale (${attempt}/${maxAttempts})…`);
          await this.resetVoiceSession(channel);
        }
        return await this.joinChannel(channel, config);
      } catch (err) {
        lastError = err;
        const expired =
          err?.code === 'VOICE_SESSION_EXPIRED' ||
          String(err?.message ?? '').includes('4006') ||
          String(err?.message ?? '').includes('VOICE_SESSION_EXPIRED');
        if (!expired || attempt === maxAttempts) throw err;
        await this.resetVoiceSession(channel);
      }
    }
    throw lastError;
  }

  /**
   * Joins a voice channel using gateway packets only (no UDP voice connection).
   * @param {VoiceChannel | StageChannel | DMChannel | GroupDMChannel | Snowflake} channel The voice channel to join
   * @param {import('./WsVoiceSession').WsVoiceSessionOptions} [options={}] Initial voice state
   * @returns {Promise<WsVoiceSession>}
   */
  async joinWsVoice(channel, options = {}) {
    channel = this.client.channels.resolve(channel);
    if (!channel) throw new Error('GUILD_CHANNEL_RESOLVE');

    if (!['DM', 'GROUP_DM'].includes(channel.type) && !channel.joinable) {
      throw new Error('VOICE_JOIN_CHANNEL', channel.full);
    }

    if (this.wsSession?.channel.id === channel.id && !this.wsSession.disconnected) {
      await this.wsSession.edit(options);
      return this.wsSession;
    }

    if (this.wsSession) {
      await this.wsSession.disconnect();
      this.wsSession = null;
    }

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }

    await this.preJoinCleanup(channel);

    const normalized = normalizeOptions(options);
    const session = new WsVoiceSession(this, channel, normalized);
    this.wsSession = session;

    session._sendVoiceStateUpdate({
      channel_id: channel.id,
      self_mute: normalized.mute,
      self_deaf: normalized.deaf,
      self_video: normalized.video,
    });

    await waitForSelfVoiceState(
      this.client,
      state => state.channelId === channel.id,
      15_000,
    ).catch(error => {
      this.wsSession = null;
      throw error;
    });

    if (normalized.stream) {
      await session.setStream(true);
    }

    return session;
  }

  /**
   * Sets up a request to join a voice channel.
   * @param {VoiceChannel | StageChannel | DMChannel | GroupDMChannel | Snowflake} channel The voice channel to join
   * @param {JoinChannelConfig} config Config to join voice channel
   * @returns {Promise<VoiceConnection>}
   */
  joinChannel(channel, config = {}) {
    return new Promise((resolve, reject) => {
      channel = this.client.channels.resolve(channel);
      if (!['DM', 'GROUP_DM'].includes(channel?.type) && !channel.joinable) {
        throw new Error('VOICE_JOIN_CHANNEL', channel.full);
      }

      const startJoin = () => {
      let connection = this.connection;

      if (connection?.status === VoiceStatus.CONNECTED && connection.channel.id === channel.id) {
        resolve(connection);
        return;
      }

      if (connection) {
        connection.disconnect();
        this.connection = null;
        connection = null;
      }

      if (this.wsSession) {
        this.wsSession.disconnect().catch(() => null);
        this.wsSession = null;
      }

      connection = new VoiceConnection(this, channel);
      if (config?.videoCodec) connection.setVideoCodec(config.videoCodec);
      connection.on('debug', msg =>
        this.client.emit('debug', `[VOICE (${channel.guild?.id || channel.id}:${connection.status})]: ${msg}`),
      );
      connection.authenticate({
        self_mute: Boolean(config.selfMute),
        self_deaf: Boolean(config.selfDeaf),
        self_video: Boolean(config.selfVideo),
      });
      this.connection = connection;

      connection.once('failed', reason => {
        this.connection = null;
        reject(reason);
      });

      connection.on('error', reject);

      connection.once('authenticated', () => {
        connection.once('ready', () => {
          resolve(connection);
          connection.removeListener('error', reject);
        });
        connection.once('disconnect', () => {
          this.connection = null;
        });
      });
      };

      this.preJoinCleanup(channel).then(startJoin).catch(reject);
    });
  }
}

module.exports = ClientVoiceManager;
