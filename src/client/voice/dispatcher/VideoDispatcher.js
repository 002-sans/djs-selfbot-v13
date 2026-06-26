'use strict';

const BaseDispatcher = require('./BaseDispatcher');

/**
 * The class that sends video packet data to the voice connection.
 * ```js
 * // Obtained using:
 * client.voice.joinChannel(channel).then(connection => {
 *   // You can play a file or a stream here:
 *   const dispatcher = connection.playVideo('/home/hydrabolt/video.mp4', { fps: 60, preset: 'ultrafast' });
 * });
 * ```
 * @extends {BaseDispatcher}
 */
class VideoDispatcher extends BaseDispatcher {
  constructor(player, highWaterMark = 12, streams, fps, payloadType) {
    super(player, highWaterMark, payloadType, true, streams);
    /**
     * Video FPS
     * @type {number}
     */
    this.fps = fps;

    this.mtu = 1200;
  }

  get TIMESTAMP_INC() {
    return 90000 / this.fps;
  }

  get FRAME_LENGTH() {
    return 1000 / this.fps;
  }

  /**
   * Get the type of the dispatcher
   * @returns {'video'}
   */
  getTypeDispatcher() {
    return 'video';
  }

  partitionMtu(data) {
    const out = [];
    const dataLength = data.length;

    for (let i = 0; i < dataLength; i += this.mtu) {
      out.push(data.slice(i, i + this.mtu));
    }

    return out;
  }

  /**
   * Set FPS
   * @param {number} value fps
   */
  setFPSSource(value) {
    this.fps = value;
  }

  shouldIncludeContentType(isLastPacket) {
    return Boolean(
      this.player.isScreenSharing && this._packetOpts?.isKeyframe && isLastPacket,
    );
  }

  getExtensionWordCount(isLastPacket) {
    return this.shouldIncludeContentType(isLastPacket) ? 2 : 1;
  }

  createHeaderExtension(extensionWordCount = 1) {
    const profile = Buffer.alloc(4);
    profile[0] = 0xbe;
    profile[1] = 0xde;
    profile.writeInt16BE(extensionWordCount, 2);
    return profile;
  }

  createPayloadExtension(includeContentType = false) {
    if (includeContentType) {
      const data = Buffer.alloc(8);
      data[0] = (5 << 4) | 1;
      data.writeUIntBE(10, 1, 2);
      data[3] = 6 << 4;
      data[4] = 0x01;
      return data;
    }
    const data = Buffer.alloc(4);
    data[0] = (5 << 4) | 1;
    data.writeUIntBE(10, 1, 2);
    return data;
  }

  _codecCallback() {
    throw new Error('The _codecCallback method must be implemented');
  }
}

module.exports = VideoDispatcher;
