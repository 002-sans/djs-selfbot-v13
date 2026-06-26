'use strict';

const EventEmitter = require('events');
const { setTimeout, setInterval } = require('node:timers');
const WebSocket = require('../../../WebSocket');
const { Error } = require('../../../errors');
const { Opcodes, VoiceOpcodes, VoiceStatus } = require('../../../util/Constants');
const { DAVESession, getMaxProtocolVersion } = require('./DAVESession');

/**
 * Represents a Voice Connection's WebSocket.
 * @extends {EventEmitter}
 * @private
 */
class VoiceWebSocket extends EventEmitter {
  constructor(connection) {
    super();
    /**
     * The Voice Connection that this WebSocket serves
     * @type {VoiceConnection}
     */
    this.connection = connection;

    /**
     * How many connection attempts have been made
     * @type {number}
     */
    this.attempts = 0;

    this._sequenceNumber = -1;

    this.dead = false;
    this._identified = false;
    this.connection.on('closing', this.shutdown.bind(this));
  }

  /**
   * The client of this voice WebSocket
   * @type {Client}
   * @readonly
   */
  get client() {
    return this.connection.client;
  }

  shutdown() {
    this.emit('debug', `[WS] shutdown requested`);
    this.dead = true;
    this.reset();
  }

  /**
   * Resets the current WebSocket.
   */
  reset() {
    this.emit('debug', `[WS] reset requested`);
    if (this.ws) {
      if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close();
      this.ws = null;
    }
    this.clearHeartbeat();
    this._identified = false;
  }

  /**
   * Starts connecting to the Voice WebSocket Server.
   */
  connect() {
    this.emit('debug', `[WS] connect requested`);
    if (this.dead) return;
    if (this.ws) this.reset();
    if (this.attempts >= 5) {
      this.emit('error', new Error('VOICE_CONNECTION_ATTEMPTS_EXCEEDED', this.attempts));
      return;
    }

    this.attempts++;

    /**
     * The actual WebSocket used to connect to the Voice WebSocket Server.
     * @type {WebSocket}
     */
    this.ws = WebSocket.create(`wss://${this.connection.authentication.endpoint}/`, { v: 8 });
    this.emit('debug', `[WS] connecting, ${this.attempts} attempts, ${this.ws.url}`);
    this.ws.onopen = this.onOpen.bind(this);
    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onclose = this.onClose.bind(this);
    this.ws.onerror = this.onError.bind(this);
  }

  /**
   * Sends data to the WebSocket if it is open.
   * @param {string|Buffer} data The data to send to the WebSocket
   * @returns {Promise<string|Buffer>}
   */
  send(data) {
    const preview = typeof data === 'string' ? data : `[bin] ${data.byteLength} bytes`;
    this.emit('debug', `[WS] >> ${preview}`);
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('WS_NOT_OPEN', preview);
      this.ws.send(data, null, error => {
        if (error) reject(error);
        else resolve(data);
      });
    });
  }

  /**
   * JSON.stringify's a packet and then sends it to the WebSocket Server.
   * @param {Object} packet The packet to send
   * @returns {Promise<string>}
   */
  async sendPacket(packet) {
    packet = JSON.stringify(packet);
    return this.send(packet);
  }

  /**
   * Sends a binary message over the WebSocket.
   * @param {number} opcode The opcode to use
   * @param {Buffer} payload The payload to send
   * @returns {Promise<Buffer>}
   */
  sendBinaryMessage(opcode, payload) {
    const message = Buffer.concat([Buffer.from([opcode]), payload]);
    return this.send(message);
  }

  /**
   * Called whenever the WebSocket opens.
   */
  onOpen() {
    this.emit('debug', `[WS] opened at gateway ${this.connection.authentication.endpoint}`);
  }

  sendIdentify() {
    if (this._identified) return Promise.resolve();
    this._identified = true;

    const isStream = this.connection.constructor.name === 'StreamConnection';
    const sessionId = this.connection.authentication.sessionId;
    const maxDave = getMaxProtocolVersion();
    const data = {
      server_id: this.connection.serverId || this.connection.channel.guild?.id || this.connection.channel.id,
      user_id: this.client.user.id,
      token: this.connection.authentication.token,
      session_id: sessionId,
    };
    if (maxDave > 0) data.max_dave_protocol_version = maxDave;

    if (isStream) {
      data.channel_id = this.connection.channel.id;
      data.streams = [{ type: 'screen', rid: '100', quality: 100 }];
      data.video = true;
    }

    return this.sendPacket({
      op: VoiceOpcodes.IDENTIFY,
      d: data,
    });
  }

  /**
   * Called whenever a message is received from the WebSocket.
   * @param {MessageEvent} event The message event that was received
   * @returns {void}
   */
  onMessage(event) {
    try {
      const { data } = event;
      if (data instanceof ArrayBuffer || Buffer.isBuffer(data)) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const seq = buffer.readUInt16BE(0);
        const op = buffer.readUInt8(2);
        const payload = buffer.subarray(3);
        this._sequenceNumber = seq;
        this.emit('debug', `[WS] << [bin] opcode ${op}, seq ${seq}, ${payload.byteLength} bytes`);
        return this.onBinaryMessage({ op, seq, payload });
      }
      return this.onPacket(WebSocket.unpack(data, 'json'));
    } catch (error) {
      return this.onError(error);
    }
  }

  usesSharedDaveSession() {
    return (
      this.connection.constructor.name === 'StreamConnection' &&
      this.connection.voiceConnection?.dave === this.connection.dave
    );
  }

  onBinaryMessage(message) {
    const { dave } = this.connection;
    if (!dave) return;
    if (this.usesSharedDaveSession()) {
      this.emit('debug', `[WS] << [bin] opcode ${message.op} ignored (shared MLS session)`);
      return;
    }

    switch (message.op) {
      case VoiceOpcodes.DAVE_MLS_EXTERNAL_SENDER:
        dave.setExternalSender(message.payload);
        break;
      case VoiceOpcodes.DAVE_MLS_PROPOSALS: {
        const payload = dave.processProposals(message.payload, this.connection.connectedClients);
        if (payload) this.sendBinaryMessage(VoiceOpcodes.DAVE_MLS_COMMIT_WELCOME, payload);
        break;
      }
      case VoiceOpcodes.DAVE_MLS_ANNOUNCE_COMMIT_TRANSITION: {
        const { transitionId, success } = dave.processCommit(message.payload);
        if (success) {
          if (transitionId === 0) {
            this.emit('transitioned', transitionId);
          } else {
            this.sendPacket({
              op: VoiceOpcodes.DAVE_TRANSITION_READY,
              d: { transition_id: transitionId },
            });
          }
        }
        break;
      }
      case VoiceOpcodes.DAVE_MLS_WELCOME: {
        const { transitionId, success } = dave.processWelcome(message.payload);
        if (success) {
          if (transitionId === 0) {
            this.emit('transitioned', transitionId);
          } else {
            this.sendPacket({
              op: VoiceOpcodes.DAVE_TRANSITION_READY,
              d: { transition_id: transitionId },
            });
          }
        }
        break;
      }
      default:
        this.emit('unknownPacket', message);
    }
  }

  /**
   * Called whenever the connection to the WebSocket server is lost.
   * @param {CloseEvent} event The WebSocket close event
   */
  onClose(event) {
    this.emit('debug', `[WS] closed with code ${event.code} and reason: ${event.reason}`);
    if (event.code === 4017) {
      this.dead = true;
      this.emit(
        'error',
        new Error('VOICE_DAVE_REQUIRED', 'Discord requires DAVE/E2EE protocol support. Ensure @snazzah/davey is installed.'),
      );
      return;
    }
    if (event.code === 4006) {
      this.dead = true;
      const guildId = this.connection.channel.guild?.id;
      if (guildId) {
        this.connection.channel.client.ws.broadcast({
          op: Opcodes.VOICE_STATE_UPDATE,
          d: { guild_id: guildId, channel_id: null, self_mute: false, self_deaf: false },
        });
      }
      this.emit('error', new Error('VOICE_SESSION_EXPIRED'));
      return;
    }
    if (!this.dead) setTimeout(this.connect.bind(this), this.attempts * 1000).unref();
  }

  /**
   * Called whenever an error occurs with the WebSocket.
   * @param {Error} error The error that occurred
   */
  onError(error) {
    this.emit('debug', `[WS] Error: ${error}`);
    this.emit('error', error);
  }

  setupDaveSession(protocolVersion) {
    const isStream = this.connection.constructor.name === 'StreamConnection';
    const parentDave = this.connection.voiceConnection?.dave;

    if (isStream && parentDave?.session) {
      this.connection.dave = parentDave;
      this.connection.connectedClients.add(this.client.user.id);
      for (const id of this.connection.voiceConnection.connectedClients) {
        this.connection.connectedClients.add(id);
      }
      this.emit('debug', '[DAVE] Reusing parent voice connection MLS session');
      return;
    }

    if (this.connection.dave) {
      const isSharedDave = isStream && this.connection.dave === parentDave;
      if (!isSharedDave) {
        this.connection.dave.destroy();
        this.connection.dave.removeAllListeners();
      }
    }

    if (!protocolVersion || getMaxProtocolVersion() === 0) {
      this.connection.dave = null;
      return;
    }

    const session = new DAVESession(
      protocolVersion,
      this.client.user.id,
      this.connection.channel.id,
    );

    session.on('debug', msg => this.emit('debug', `[DAVE] ${msg}`));
    session.on('keyPackage', keyPackage => {
      this.sendBinaryMessage(VoiceOpcodes.DAVE_MLS_KEY_PACKAGE, keyPackage).catch(e => this.emit('error', e));
    });
    session.on('invalidateTransition', transitionId => {
      this.sendPacket({
        op: VoiceOpcodes.DAVE_MLS_INVALID_COMMIT_WELCOME,
        d: { transition_id: transitionId },
      }).catch(e => this.emit('error', e));
    });
    session.on('error', err => this.emit('error', err));

    this.connection.dave = session;
    this.connection.connectedClients.add(this.client.user.id);
    if (this.connection.voiceConnection?.connectedClients) {
      for (const id of this.connection.voiceConnection.connectedClients) {
        this.connection.connectedClients.add(id);
      }
    }
    session.reinit();
  }

  handleDavePacket(packet) {
    const { dave } = this.connection;
    if (!dave) return;

    switch (packet.op) {
      case VoiceOpcodes.DAVE_PREPARE_TRANSITION: {
        const sendReady = dave.prepareTransition(packet.d);
        if (sendReady) {
          this.sendPacket({
            op: VoiceOpcodes.DAVE_TRANSITION_READY,
            d: { transition_id: packet.d.transition_id },
          });
        }
        if (packet.d.transition_id === 0) this.emit('transitioned', 0);
        break;
      }
      case VoiceOpcodes.DAVE_EXECUTE_TRANSITION: {
        const transitioned = dave.executeTransition(packet.d.transition_id);
        if (transitioned) this.emit('transitioned', packet.d.transition_id);
        break;
      }
      case VoiceOpcodes.DAVE_PREPARE_EPOCH:
        dave.prepareEpoch(packet.d);
        break;
      default:
        break;
    }
  }

  /**
   * Called whenever a valid packet is received from the WebSocket.
   * @param {Object} packet The received packet
   */
  onPacket(packet) {
    this.emit('debug', `[WS] << ${JSON.stringify(packet)}`);
    if (packet.seq) this._sequenceNumber = packet.seq;

    if (
      [
        VoiceOpcodes.DAVE_PREPARE_TRANSITION,
        VoiceOpcodes.DAVE_EXECUTE_TRANSITION,
        VoiceOpcodes.DAVE_PREPARE_EPOCH,
      ].includes(packet.op)
    ) {
      if (!this.usesSharedDaveSession()) this.handleDavePacket(packet);
      return;
    }

    switch (packet.op) {
      case VoiceOpcodes.HELLO:
        this.setHeartbeat(packet.d.heartbeat_interval);
        this.sendIdentify().catch(() => {
          this.emit('error', new Error('VOICE_JOIN_SOCKET_CLOSED'));
        });
        break;
      case VoiceOpcodes.READY:
        /**
         * Emitted once the voice WebSocket receives the ready packet.
         * @param {Object} packet The received packet
         * @event VoiceWebSocket#ready
         */
        this.emit('ready', packet.d);
        break;
      /* eslint-disable no-case-declarations */
      case VoiceOpcodes.SESSION_DESCRIPTION:
        packet.d.secret_key = new Uint8Array(packet.d.secret_key);
        this.setupDaveSession(packet.d.dave_protocol_version ?? 0);
        /**
         * Emitted once the Voice Websocket receives a description of this voice session.
         * @param {Object} packet The received packet
         * @event VoiceWebSocket#sessionDescription
         */
        this.emit('sessionDescription', packet.d);
        break;
      case VoiceOpcodes.CLIENTS_CONNECT:
        for (const id of packet.d.user_ids) this.connection.connectedClients.add(id);
        break;
      case VoiceOpcodes.CLIENT_CONNECT:
        this.connection.ssrcMap.set(+packet.d.audio_ssrc, {
          userId: packet.d.user_id,
          speaking: 0,
          hasVideo: Boolean(packet.d.video_ssrc),
        });
        break;
      case VoiceOpcodes.CLIENT_DISCONNECT:
        this.connection.connectedClients.delete(packet.d.user_id);
        const streamInfo = this.connection.receiver && this.connection.receiver.packets.streams.get(packet.d.user_id);
        if (streamInfo) {
          this.connection.receiver.packets.streams.delete(packet.d.user_id);
          streamInfo.stream.push(null);
        }
        break;
      case VoiceOpcodes.SPEAKING:
        /**
         * Emitted whenever a speaking packet is received.
         * @param {Object} data
         * @event VoiceWebSocket#startSpeaking
         */
        this.emit('startSpeaking', packet.d);
        break;
      case VoiceOpcodes.SOURCES:
        /**
         * Emitted whenever a streaming packet is received.
         * @param {Object} data
         * @event VoiceWebSocket#startStreaming
         */
        this.emit('startStreaming', packet.d);
        break;
      default:
        /**
         * Emitted when an unhandled packet is received.
         * @param {Object} packet
         * @event VoiceWebSocket#unknownPacket
         */
        this.emit('unknownPacket', packet);
        break;
    }
  }

  /**
   * Sets an interval at which to send a heartbeat packet to the WebSocket.
   * @param {number} interval The interval at which to send a heartbeat packet
   */
  setHeartbeat(interval) {
    if (!interval || isNaN(interval)) {
      this.onError(new Error('VOICE_INVALID_HEARTBEAT'));
      return;
    }
    if (this.heartbeatInterval) {
      /**
       * Emitted whenever the voice WebSocket encounters a non-fatal error.
       * @param {string} warn The warning
       * @event VoiceWebSocket#warn
       */
      this.emit('warn', 'A voice heartbeat interval is being overwritten');
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = setInterval(this.sendHeartbeat.bind(this), interval).unref();
  }

  /**
   * Clears a heartbeat interval, if one exists.
   */
  clearHeartbeat() {
    if (!this.heartbeatInterval) return;
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  /**
   * Sends a heartbeat packet.
   */
  sendHeartbeat() {
    this.sendPacket({
      op: VoiceOpcodes.HEARTBEAT,
      d: {
        t: Date.now(),
        seq_ack: this._sequenceNumber,
      },
    }).catch(() => {
      this.emit('warn', 'Tried to send heartbeat, but connection is not open');
      this.clearHeartbeat();
    });
  }
}

module.exports = VoiceWebSocket;
