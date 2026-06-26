// Fetch available quests and print a summary.

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  await client.quests.get();
  const quests = client.quests.list();

  console.log(`Found ${quests.length} quest(s)\n`);

  for (const quest of quests) {
    const name = quest.config?.messages?.quest_name ?? quest.id;
    const tasks = quest.config?.task_config ?? quest.config?.task_config_v2 ?? {};
    const taskNames = Object.keys(tasks).join(', ') || 'unknown';

    console.log(`- ${name}`);
    console.log(`  ID: ${quest.id}`);
    console.log(`  Tasks: ${taskNames}`);
    console.log(`  Completed: ${quest.isCompleted()}`);
    console.log(`  Claimed: ${quest.hasClaimedRewards()}`);
    console.log(`  Expired: ${quest.isExpired()}`);
    console.log('');
  }

  const balance = await client.quests.orbs();
  console.log('Virtual currency balance:', balance);
});

client.login(process.env.TOKEN ?? 'token');
