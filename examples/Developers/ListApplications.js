// List developer applications owned by the current account.

const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const applications = await client.developers.get(true);

  console.log(`Found ${applications.size} application(s)\n`);

  for (const app of applications.values()) {
    console.log(`- ${app.name} (${app.id})`);
    if (app.description) console.log(`  ${app.description}`);
    if (app.bot?.id) console.log(`  Bot ID: ${app.bot.id}`);
  }
});

client.login(process.env.TOKEN ?? 'token');
