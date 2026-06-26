'use strict';

const { AnnexBBitstreamReader, AnnexBBitstreamWriter } = require('./AnnexBBitstreamReaderWriter');

function rewriteSPSVUI(buffer) {
  const reader = new AnnexBBitstreamReader(buffer.subarray(1));
  const writer = new AnnexBBitstreamWriter();

  const readBit = (n = 1) => reader.readBits(n);
  const writeBit = (v, n = 1) => writer.writeBits(v, n);
  const readU = n => reader.readUnsigned(n);
  const writeU = (v, n) => writer.writeUnsigned(v, n);
  const readUE = () => reader.readUnsignedExpGolomb();
  const writeUE = v => writer.writeUnsignedExpGolomb(v);
  const readSE = () => reader.readSignedExpGolomb();
  const writeSE = v => writer.writeSignedExpGolomb(v);

  writeU(buffer[0], 8);

  const profile_idc = readU(8);
  writeU(profile_idc, 8);
  const constraint_flags = readU(8);
  writeU(constraint_flags, 8);
  const level_idc = readU(8);
  writeU(level_idc, 8);
  const seq_parameter_set_id = readUE();
  writeUE(seq_parameter_set_id);

  const highProfiles = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 144]);
  if (highProfiles.has(profile_idc)) {
    const chroma_format_idc = readUE();
    writeUE(chroma_format_idc);
    if (chroma_format_idc === 3) writeBit(readBit(1), 1);
    writeUE(readUE());
    writeUE(readUE());
    writeBit(readBit(1), 1);
    const seq_scaling_matrix_present_flag = readBit(1);
    writeBit(seq_scaling_matrix_present_flag, 1);
    if (seq_scaling_matrix_present_flag) {
      const scalingCount = chroma_format_idc !== 3 ? 8 : 12;
      for (let i = 0; i < scalingCount; i++) {
        const seq_scaling_list_present_flag = readBit(1);
        writeBit(seq_scaling_list_present_flag, 1);
        if (seq_scaling_list_present_flag) {
          const size = i < 6 ? 16 : 64;
          let lastScale = 8;
          for (let j = 0; j < size; j++) {
            const delta = readSE();
            writeSE(delta);
            const nextScale = (lastScale + delta + 256) % 256;
            if (nextScale !== 0) lastScale = nextScale;
          }
        }
      }
    }
  }

  writeUE(readUE());
  const pic_order_cnt_type = readUE();
  writeUE(pic_order_cnt_type);
  if (pic_order_cnt_type === 0) writeUE(readUE());
  else if (pic_order_cnt_type === 1) {
    writeBit(readBit(1), 1);
    writeSE(readSE());
    writeSE(readSE());
    const num_ref_frames_in_pic_order_cnt_cycle = readUE();
    writeUE(num_ref_frames_in_pic_order_cnt_cycle);
    for (let i = 0; i < num_ref_frames_in_pic_order_cnt_cycle; i++) writeSE(readSE());
  }

  const max_num_ref_frames = readUE();
  writeUE(max_num_ref_frames);
  writeBit(readBit(1), 1);
  writeUE(readUE());
  writeUE(readUE());
  const frame_mbs_only_flag = readBit(1);
  writeBit(frame_mbs_only_flag, 1);
  if (frame_mbs_only_flag === 0) writeBit(readBit(1), 1);
  writeBit(readBit(1), 1);
  const frame_cropping_flag = readBit(1);
  writeBit(frame_cropping_flag, 1);
  if (frame_cropping_flag) {
    writeUE(readUE());
    writeUE(readUE());
    writeUE(readUE());
    writeUE(readUE());
  }

  function addBitstreamRestriction() {
    writeBit(1, 1);
    writeUE(2);
    writeUE(1);
    writeUE(16);
    writeUE(16);
    writeUE(0);
    writeUE(max_num_ref_frames);
  }

  const vui_parameters_present_flag = readBit(1);
  writeBit(1, 1);
  if (!vui_parameters_present_flag) {
    writeBit(0, 2);
    writeBit(0, 1);
    writeBit(0, 5);
    writeBit(1, 1);
    addBitstreamRestriction();
  } else {
    const aspect_ratio_info_present_flag = readBit(1);
    writeBit(aspect_ratio_info_present_flag, 1);
    if (aspect_ratio_info_present_flag) {
      const aspect_ratio_idc = readU(8);
      writeU(aspect_ratio_idc, 8);
      if (aspect_ratio_idc === 255) {
        writeU(readU(16), 16);
        writeU(readU(16), 16);
      }
    }
    const overscan_info_present_flag = readBit(1);
    writeBit(overscan_info_present_flag, 1);
    if (overscan_info_present_flag) writeBit(readBit(1), 1);
    const video_signal_type_present_flag = readBit(1);
    writeBit(0, 1);
    if (video_signal_type_present_flag) {
      readBit(3);
      readBit(1);
      const colour_description_present_flag = readBit(1);
      if (colour_description_present_flag) {
        readU(8);
        readU(8);
        readU(8);
      }
    }
    const chroma_loc_info_present_flag = readBit(1);
    writeBit(chroma_loc_info_present_flag, 1);
    if (chroma_loc_info_present_flag) {
      writeUE(readUE());
      writeUE(readUE());
    }
    const timing_info_present_flag = readBit(1);
    writeBit(timing_info_present_flag, 1);
    if (timing_info_present_flag) {
      writeU(readU(32), 32);
      writeU(readU(32), 32);
      writeBit(readBit(1), 1);
    }
    const nal_hrd_parameters_present_flag = readBit(1);
    writeBit(nal_hrd_parameters_present_flag, 1);
    if (nal_hrd_parameters_present_flag) {
      const cpb_cnt_minus1 = readUE();
      writeUE(cpb_cnt_minus1);
      writeBit(readBit(4), 4);
      writeBit(readBit(4), 4);
      for (let i = 0; i <= cpb_cnt_minus1; i++) {
        writeUE(readUE());
        writeUE(readUE());
        writeBit(readBit(1), 1);
      }
      writeBit(readBit(5), 5);
      writeBit(readBit(5), 5);
      writeBit(readBit(5), 5);
      writeBit(readBit(5), 5);
    }
    const vcl_hrd_parameters_present_flag = readBit(1);
    writeBit(vcl_hrd_parameters_present_flag, 1);
    if (vcl_hrd_parameters_present_flag) {
      const cpb_cnt_minus1 = readUE();
      writeUE(cpb_cnt_minus1);
      writeBit(readBit(4), 4);
      writeBit(readBit(4), 4);
      for (let i = 0; i <= cpb_cnt_minus1; i++) {
        writeUE(readUE());
        writeUE(readUE());
        writeBit(readBit(1), 1);
      }
      writeBit(readBit(5), 5);
      writeBit(readBit(5), 5);
      writeBit(readBit(5), 5);
      writeBit(readBit(5), 5);
    }
    if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) writeBit(readBit(1), 1);
    writeBit(readBit(1), 1);
    const bitstream_restriction_flag = readBit(1);
    writeBit(1, 1);
    if (!bitstream_restriction_flag) addBitstreamRestriction();
    else {
      writeBit(readBit(1), 1);
      writeUE(readUE());
      writeUE(readUE());
      writeUE(readUE());
      writeUE(readUE());
      readUE();
      writeUE(0);
      readUE();
      writeUE(max_num_ref_frames);
    }
  }

  writeBit(1, 1);
  writer.flush();
  return writer.toBuffer();
}

module.exports = { rewriteSPSVUI };
