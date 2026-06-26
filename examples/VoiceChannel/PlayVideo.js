/*
Credit: https://github.com/dank074/Discord-video-stream
The use of video streaming in this library is an incomplete implementation with many bugs, primarily aimed at lazy users.
Please use the @dank074/discord-video-stream library for stable and smooth streaming.

Install:
- An Opus library: @discordjs/opus or opusscript
- An encryption packages:
  + sodium (best performance)
  + libsodium-wrappers
  + @stablelib/xchacha20poly1305
- ffmpeg (install and add to your system environment)
*/

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);
  const channel = client.channels.cache.get('voice_channel');
  const connection = await client.voice.joinChannel(channel, {
    selfMute: true,
    selfDeaf: true,
    selfVideo: false,
    videoCodec: 'H264',
  });
  const stream = await connection.createStreamConnection();
  const input = 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  const dispatcher = stream.playVideo(input, {
    fps: 60,
    bitrate: 4000,
  });
  const dispatcher2 = stream.playAudio(input);

  dispatcher.on('start', () => console.log('video is now playing!'));
  dispatcher.on('finish', () => console.log('video has finished playing!'));
  dispatcher.on('error', console.error);

  dispatcher2.on('start', () => console.log('audio is now playing!'));
  dispatcher2.on('finish', () => console.log('audio has finished playing!'));
  dispatcher2.on('error', console.error);
});

client.login('token');
