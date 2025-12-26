# Discord.js Selfbot v13 Documentation

Welcome to the Discord.js Selfbot v13 documentation.

## Getting Started

This is a modified version of Discord.js designed for selfbot usage.

## Features

- Full Discord API support
- User account compatibility
- Quest management
- Rich presence support
- And much more...

## New Methods

### Client#fetchUserWithBot

Fetches a user using a specific bot token.

```javascript
client.fetchUserWithBot('123456789012345678', 'Bot YOUR_BOT_TOKEN')
  .then(user => console.log(`Fetched user: ${user.tag}`))
  .catch(console.error);
```