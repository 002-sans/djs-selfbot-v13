'use strict';

const VoiceSession = require('./VoiceSession');
const { normalizeData } = require('./VoiceSession');
const { Error } = require('../../errors');
const { Events, Opcodes } = require('../../util/Constants');

/**
 * Manages voice connections for the client.
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
     * Active UDP voice connection (when streamLink/videoLink is used)
     * @type {?VoiceConnection}
     */
    this.connection = null;

    /**
     * Active unified voice session
     * @type {?VoiceSession}
     */
    this.session = null;

    /**
     * Maps guild ids to voice adapters created for use with @discordjs/voice.
     * @type {Map<Snowflake, Object>}
     */
    this.adapters = new Map();

    client.on(Events.SHARD_DISCONNECT, () => {
      for (const adapter of this.adapters.values()) {
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
    if (payload.guild_id) {
      this.adapters.get(payload.guild_id)?.onVoiceServerUpdate(payload);
    } else {
      this.adapters.get(payload.channel_id)?.onVoiceServerUpdate(payload);
    }
  }

  onVoiceStateUpdate(payload) {
    const { guild_id, session_id, channel_id } = payload;
    if (payload.user_id !== this.client.user?.id) return;

    if (payload.guild_id && payload.session_id && payload.user_id === this.client.user?.id) {
      this.adapters.get(payload.guild_id)?.onVoiceStateUpdate(payload);
    } else if (payload.channel_id && payload.session_id && payload.user_id === this.client.user?.id) {
      this.adapters.get(payload.channel_id)?.onVoiceStateUpdate(payload);
    }

    const connection = this.connection;
    this.client.emit('debug', `[VOICE] connection? ${!!connection}, ${guild_id} ${session_id} ${channel_id}`);
    if (!connection) return;
    if (!channel_id) {
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

      if (this.session) {
        this.session.disconnect().catch(() => null);
        this.session = null;
      }

      if (this.connection) {
        this.connection.disconnect();
        this.connection = null;
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
   * Joins a voice channel.
   * Without `streamLink`/`videoLink`: gateway WS only.
   * With `streamLink`/`videoLink`: full UDP media connection.
   * @param {VoiceChannel | StageChannel | DMChannel | GroupDMChannel | Snowflake} channel Channel to join
   * @param {JoinVoiceData} [data={}] Voice options
   * @returns {Promise<VoiceSession>}
   * @example
   * const voice = await client.voice.joinVoice(channel, { mute: true, stream: true });
   * await voice.setMute(false);
   * await voice.setStreamLink('video.mp4');
   * voice.pauseStream();
   * voice.unpauseStream();
   * voice.streamTime(1000 * 60 + 1000);
   * await voice.disconnect();
   */
  async joinVoice(channel, data = {}) {
    channel = this.client.channels.resolve(channel);
    if (!channel) throw new Error('GUILD_CHANNEL_RESOLVE');

    if (!['DM', 'GROUP_DM'].includes(channel.type) && !channel.joinable) {
      throw new Error('VOICE_JOIN_CHANNEL', channel.full);
    }

    const normalized = normalizeData(data);

    if (
      this.session &&
      this.session.channel.id === channel.id &&
      !this.session.disconnected &&
      !normalized.streamLink &&
      !normalized.videoLink &&
      !this.session.udp
    ) {
      if (normalized.mute !== this.session._mute) await this.session.setMute(normalized.mute);
      if (normalized.deaf !== this.session._deaf) await this.session.setDeaf(normalized.deaf);
      if (normalized.video !== this.session._video) await this.session.setVideo(normalized.video);
      if (normalized.stream !== this.session._streaming) await this.session.setStream(normalized.stream);
      return this.session;
    }

    if (this.session) {
      await this.session.disconnect().catch(() => null);
      this.session = null;
    }

    await this.preJoinCleanup(channel);

    const session = new VoiceSession(this, channel, normalized);
    this.session = session;

    try {
      await session._connect();
    } catch (error) {
      this.session = null;
      throw error;
    }

    return session;
  }
}

module.exports = ClientVoiceManager;
