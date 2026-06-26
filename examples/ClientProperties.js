// Client build/version properties are fetched automatically on login.
// Useful for quests and API headers that expect up-to-date Discord client metadata.

const { Client } = require('../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const props = client.options.ws.properties;
  console.log('Client properties:');
  console.log(`  client_version: ${props.client_version}`);
  console.log(`  client_build_number: ${props.client_build_number}`);
  console.log(`  native_build_number: ${props.native_build_number}`);
  console.log(`  browser_version: ${props.browser_version}`);
});

client.login(process.env.TOKEN ?? 'token');
