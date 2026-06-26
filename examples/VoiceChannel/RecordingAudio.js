// https://v12.discordjs.guide/voice/receiving-audio.html#basic-usage

/*
Install:
- An Opus library: @discordjs/opus or opusscript
- An encryption packages:
  + sodium (best performance)
  + libsodium-wrappers
  + @stablelib/xchacha20poly1305
- ffmpeg (install and add to your system environment)
*/

const fs = require('fs');
const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const channel = client.channels.cache.get('voice_id');
  const connection = await client.voice.joinChannel(channel, {
    selfMute: true,
    selfDeaf: true,
    selfVideo: false,
  });

  const audio = connection.receiver.createStream('user_id', {
    mode: 'pcm',
    end: 'manual',
    paddingSilence: true,
  });

  audio.pipe(fs.createWriteStream('test.pcm'));

  setTimeout(() => {
    console.log('Stop recording');
    audio.destroy();
  }, 15_000);
});

client.login('token');
