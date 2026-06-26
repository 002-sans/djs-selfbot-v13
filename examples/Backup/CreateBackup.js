// Create a guild backup and store it in the in-memory cache.
// Requires Manage Guild permission on the source guild.

const fs = require('fs');
const path = require('path');
const { Client } = require('../../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const guildId = process.env.GUILD_ID ?? 'guild_id';
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    console.error(`Guild ${guildId} not found in cache`);
    return;
  }

  const backupData = await client.backups.cache.create(guildId, {
    maxMessagesPerChannel: 10,
    backupMembers: false,
    doNotBackup: ['bans'],
    saveImages: 'base64',
  });

  console.log(`Backup created: ${backupData.id}`);
  console.log(`Guild: ${backupData.name} (${backupData.guildID})`);
  console.log(`Roles: ${backupData.roles.length}, Channels: ${backupData.channels.categories.length + backupData.channels.others.length}`);

  const outputPath = path.join(__dirname, `${backupData.id}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2));
  console.log(`Saved to ${outputPath}`);
});

client.login(process.env.TOKEN ?? 'token');
