// Enable getLastProperties to fetch the latest Discord client properties
// (build number, client version, native build number, browser user-agent)
// before connecting to the gateway. This keeps your session up-to-date
// with the latest official Discord desktop client metadata.

const { Client } = require('../src/index');

const client = new Client({
  // Fetch the latest Discord client properties before login
  getLastProperties: true,
});

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const props = client.options.ws.properties;
  console.log('Updated client properties:');
  console.log(`  client_version: ${props.client_version}`);
  console.log(`  client_build_number: ${props.client_build_number}`);
  console.log(`  native_build_number: ${props.native_build_number}`);
  console.log(`  browser_user_agent: ${props.browser_user_agent}`);
});

client.login(process.env.TOKEN ?? 'token');
