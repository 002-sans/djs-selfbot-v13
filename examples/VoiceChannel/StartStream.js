// High-level Go Live + video stream helper (WebRTC).
// Requires ffmpeg and voice dependencies (see JoinVoice.js).

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const guildId = process.env.GUILD_ID ?? 'guild_id';
  const channelId = process.env.VOICE_CHANNEL_ID ?? 'voice_channel_id';
  const url = process.env.STREAM_URL ?? 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  const session = await client.startStream({
    guildId,
    channelId,
    url,
    fps: 60,
    height: 720,
    bitrate: 4500,
    goLive: true,
  });

  console.log('Stream started');

  session.on('playing', () => console.log('Playback started'));
  session.on('finish', () => console.log('Playback finished'));
  session.on('error', console.error);

  setTimeout(async () => {
    session.pause();
    console.log('Paused');
  }, 30_000);

  setTimeout(async () => {
    session.resume();
    console.log('Resumed');
  }, 45_000);

  setTimeout(async () => {
    await session.stop();
    console.log('Stopped');
  }, 120_000);
});

client.login(process.env.TOKEN ?? 'token');
