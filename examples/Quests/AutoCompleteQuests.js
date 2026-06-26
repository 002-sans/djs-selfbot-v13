// Auto-complete all valid quests and optionally redeem rewards.

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  await client.quests.autoCompleteAll({
    redeem: true,
  });

  console.log('Done!');
  const claimable = client.quests.getClaimable();
  console.log(`${claimable.length} quest(s) still claimable`);
});

client.login(process.env.TOKEN ?? 'token');
