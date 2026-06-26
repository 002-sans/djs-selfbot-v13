// Set or remove a voice channel status (shown under the channel name).

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const channel = client.channels.cache.get(process.env.VOICE_CHANNEL_ID ?? 'voice_channel_id');
  if (!channel?.setStatus) {
    console.error('Channel is not a guild voice channel');
    return;
  }

  await channel.setStatus('Listening to music 🎵');
  console.log(`Status set on #${channel.name}`);

  setTimeout(async () => {
    await channel.setStatus(null);
    console.log('Status cleared');
  }, 15_000);
});

client.login(process.env.TOKEN ?? 'token');
