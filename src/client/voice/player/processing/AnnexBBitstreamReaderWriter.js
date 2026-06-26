'use strict';

class AnnexBBitstreamReader {
  constructor(buffer) {
    this._buffer = buffer;
    this._byteOffset = 0;
    this._bitOffset = 0;
  }

  readBits(count) {
    if (count === 0) return 0;
    let result = 0;
    while (count > 0) {
      if (this._byteOffset >= this._buffer.length) throw new Error('Bad byte offset');
      if (
        this._bitOffset === 0 &&
        this._byteOffset >= 2 &&
        this._buffer[this._byteOffset - 2] === 0 &&
        this._buffer[this._byteOffset - 1] === 0 &&
        this._buffer[this._byteOffset] === 3
      ) {
        this._byteOffset++;
      }
      if (this._bitOffset === 0 && count >= 8) {
        result = (result << 8) | this._buffer[this._byteOffset++];
        count -= 8;
      } else {
        const numBitsToRead = Math.min(count, 8 - this._bitOffset);
        const mask = (1 << numBitsToRead) - 1;
        const newBits = (this._buffer[this._byteOffset] >> (8 - this._bitOffset - numBitsToRead)) & mask;
        result = (result << numBitsToRead) | newBits;
        count -= numBitsToRead;
        this._bitOffset += numBitsToRead;
        if (this._bitOffset === 8) {
          this._bitOffset = 0;
          this._byteOffset++;
        }
      }
    }
    return result;
  }

  readUnsigned(bits) {
    return this.readBits(bits);
  }

  readSigned(bits) {
    const unsigned = this.readUnsigned(bits);
    if (unsigned & (1 << (bits - 1))) return unsigned - (1 << bits);
    return unsigned;
  }

  readUnsignedExpGolomb() {
    let leading0 = 0;
    while (this.readBits(1) === 0) leading0++;
    return (1 << leading0) + this.readBits(leading0) - 1;
  }

  readSignedExpGolomb() {
    const unsigned = this.readUnsignedExpGolomb();
    if (unsigned % 2 === 0) return unsigned / -2;
    return (unsigned + 1) / 2;
  }
}

class AnnexBBitstreamWriter {
  constructor() {
    this._arr = [];
    this._pendingByte = 0;
    this._bitOffset = 0;
  }

  toBuffer() {
    return Buffer.from(this._arr);
  }

  flush() {
    if (this._pendingByte <= 3 && this._arr.at(-1) === 0 && this._arr.at(-2) === 0) this._arr.push(3);
    this._arr.push(this._pendingByte);
    this._pendingByte = 0;
    this._bitOffset = 0;
  }

  writeBits(bits, count) {
    while (count > 0) {
      if (this._bitOffset === 0) {
        if (count >= 8) {
          this._pendingByte = (bits >> (count - 8)) & 0xff;
          count -= 8;
          this.flush();
        } else {
          const mask = (1 << count) - 1;
          this._pendingByte |= (bits & mask) << (8 - count);
          this._bitOffset = count;
          count = 0;
        }
      } else {
        const numBitsToWrite = Math.min(8 - this._bitOffset, count);
        const bitsToWrite = (bits >> (count - numBitsToWrite)) & ((1 << numBitsToWrite) - 1);
        this._pendingByte |= bitsToWrite << (8 - this._bitOffset - numBitsToWrite);
        count -= numBitsToWrite;
        this._bitOffset += numBitsToWrite;
        if (this._bitOffset === 8) {
          this._bitOffset = 0;
          this.flush();
        }
      }
    }
  }

  writeUnsigned(num, count) {
    if (num < 0) throw new Error('Expected a non-negative number');
    this.writeBits(num, count);
  }

  writeSigned(num, count) {
    if (count <= 0) return;
    if (count > 32) throw new Error('writeSigned supports up to 32 bits');
    const mask = count === 32 ? 0xffffffff >>> 0 : (((1 << count) >>> 0) - 1) >>> 0;
    this.writeBits((num & mask) >>> 0, count);
  }

  writeUnsignedExpGolomb(num) {
    if (num < 0) throw new Error('Expected a non-negative number');
    num++;
    const bitCount = 32 - Math.clz32(num >>> 0);
    this.writeBits(0, bitCount - 1);
    this.writeBits(num, bitCount);
  }

  writeSignedExpGolomb(num) {
    if (num < 0) this.writeUnsignedExpGolomb(-2 * num);
    else this.writeUnsignedExpGolomb(2 * num - 1);
  }
}

module.exports = { AnnexBBitstreamReader, AnnexBBitstreamWriter };
