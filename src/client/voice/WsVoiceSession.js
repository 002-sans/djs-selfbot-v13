'use strict';

/*
 * @deprecated Use {@link VoiceSession} via `client.voice.joinVoice()`.
 * Kept as a compatibility re-export.
 */
module.exports = require('./VoiceSession');
module.exports.getStreamKey = require('./VoiceSession').getStreamKey;
module.exports.normalizeOptions = require('./VoiceSession').normalizeData;
module.exports.normalizeData = require('./VoiceSession').normalizeData;
module.exports.waitForSelfVoiceState = require('./VoiceSession').waitForSelfVoiceState;
