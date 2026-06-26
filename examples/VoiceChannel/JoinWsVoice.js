// Gateway-only voice session (no UDP / no Opus / no ffmpeg required).
// Useful for quests (STREAM_ON_DESKTOP, PLAY_ACTIVITY) or presence-only voice.

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const channel = client.channels.cache.get(process.env.VOICE_CHANNEL_ID ?? 'voice_channel_id');

  const session = await client.voice.joinWsVoice(channel, {
    selfMute: true,
    selfDeaf: true,
    selfVideo: false,
    stream: true, // Go Live signal (gateway only)
  });

  console.log(`Joined ${channel.name} via WS-only session`);
  console.log(`Stream key: ${session.streamKey}`);

  // Toggle mute/deaf/video/stream at runtime
  setTimeout(async () => {
    await session.setMute(false);
    console.log('Unmuted');
  }, 5_000);

  setTimeout(async () => {
    await session.setDeaf(false);
    console.log('Undeafened');
  }, 10_000);

  setTimeout(async () => {
    await session.disconnect();
    console.log('Left voice channel');
  }, 30_000);
});

client.login(process.env.TOKEN ?? 'token');
