// Listen for guild join request events (community servers with membership screening).

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);
  console.log('Waiting for join requests...');
});

client.on('guildJoinRequestCreate', request => {
  console.log(`New join request in ${request.guild?.name ?? request.guildId}`);
  console.log(`  User: ${request.user?.tag ?? request.userId}`);
  console.log(`  Status: ${request.status}`);

  if (request.responses?.length) {
    for (const response of request.responses) {
      console.log(`  Q: ${response.question}`);
      console.log(`  A: ${response.answers ?? '(empty)'}`);
    }
  }

  // Uncomment to auto-approve:
  // request.approuve().then(() => console.log('Approved'));
});

client.on('guildJoinRequestDelete', request => {
  console.log(`Join request removed for ${request.user?.tag ?? request.userId}`);
});

client.login(process.env.TOKEN ?? 'token');
