// Join a channel and play music, like a Discord bot.

/*
Install:
- An Opus library: @discordjs/opus or opusscript
- An encryption packages:
  + sodium (best performance)
  + libsodium-wrappers
  + @stablelib/xchacha20poly1305
- ffmpeg (install and add to your system environment)
*/

const { Client } = require('../../src/index');
const ytdl = require('@distube/ytdl-core');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);
  const channel = client.channels.cache.get('voice_id');
  const connection = await client.voice.joinChannel(channel, {
    selfMute: true,
    selfDeaf: true,
    selfVideo: false,
  });
  const dispatcher = connection.playAudio(
    ytdl('https://www.youtube.com/watch?v=3KadWjpqDXs', {
      quality: 'highestaudio',
    }),
  );
  dispatcher.on('start', () => {
    console.log('audio is now playing!');
    dispatcher.pause();
    setTimeout(() => {
      dispatcher.resume();
    }, 5_000);
    dispatcher.setVolume(0.5);
  });

  dispatcher.on('finish', () => {
    console.log('audio has finished playing!');
  });
  dispatcher.on('error', console.error);

  setTimeout(() => {
    connection.disconnect();
  }, 30_000);
});

client.login('token');
