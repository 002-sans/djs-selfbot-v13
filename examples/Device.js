// Use the `device` option to spoof the client platform sent to Discord.
// This changes the os, browser, and device fields in the WebSocket IDENTIFY payload,
// which affects how Discord displays your online status (desktop, mobile, web, etc.).
//
// Available device values:
//   'desktop'  - Discord Client on Linux (default)
//   'web'      - Discord Web
//   'mobile'   - Discord Android
//   'android'  - Discord Android
//   'iphone'   - Discord iOS
//   'ios'      - Discord iOS
//   'ps5'      - Discord Embedded (PlayStation)
//   'xbox'     - Discord Embedded (Xbox)
//   'vr'       - Discord VR

const { Client } = require('../src/index');

// Example: appear as a mobile user (shows mobile indicator on Discord)
const client = new Client({
  device: 'mobile',
});

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);
  console.log(`Device spoofed as: ${client.options.device}`);

  const props = client.options.ws.properties;
  console.log(`  os: ${props.os}`);
  console.log(`  browser: ${props.browser}`);
  console.log(`  device: ${props.device}`);
});

client.login(process.env.TOKEN ?? 'token');
