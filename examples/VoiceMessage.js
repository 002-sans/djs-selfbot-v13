const { Client, MessageAttachment } = require('../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);
  const channel = client.channels.cache.get('channel_id');
  const attachment = new MessageAttachment(
    './test.mp3',
    'random_file_name.ogg',
    {
      waveform: 'AAAAAAAAAAAA',
      duration_secs: 1,
    },
  );
  channel.send({
    files: [attachment],
    flags: 'IS_VOICE_MESSAGE',
  });
});

client.login('token');
