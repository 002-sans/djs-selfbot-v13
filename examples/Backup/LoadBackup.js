// Restore a guild from a cached backup ID or a JSON file on disk.
// WARNING: This clears the target guild by default (roles, channels, etc.).

const fs = require('fs');
const path = require('path');
const { Client } = require('../../src/index');
const backupModule = require('../../src/managers/backup');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);

  const targetGuildId = process.env.TARGET_GUILD_ID ?? 'target_guild_id';
  const backupId = process.env.BACKUP_ID;
  const backupFile = process.env.BACKUP_FILE;

  const guild = client.guilds.cache.get(targetGuildId);
  if (!guild) {
    console.error(`Guild ${targetGuildId} not found in cache`);
    return;
  }

  if (backupId) {
    const cached = client.backups.cache.get(backupId);
    if (!cached) {
      console.error(`Backup "${backupId}" not found in cache. Run CreateBackup.js first or use BACKUP_FILE.`);
      return;
    }

    await client.backups.cache.load(targetGuildId, backupId, {
      clearGuildBeforeRestore: true,
    });
    console.log(`Restored backup ${backupId} into ${guild.name}`);
    return;
  }

  if (backupFile) {
    const filePath = path.resolve(backupFile);
    const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    await backupModule.load(backupData, guild, {
      clearGuildBeforeRestore: true,
    });
    console.log(`Restored backup from ${filePath} into ${guild.name}`);
    return;
  }

  console.error('Set BACKUP_ID (cached) or BACKUP_FILE (path to .json)');
});

client.login(process.env.TOKEN ?? 'token');
