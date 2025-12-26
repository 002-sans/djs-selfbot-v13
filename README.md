
<div align="center">
  <br />
  <p>
    <a href="https://discord.js.org"><img src="https://discord.js.org/static/logo.svg" width="546" alt="discord.js" /></a>
  </p>
</div>

## About

<strong>Welcome to `djs-selfbot-v13@v3.7`, based on `discord.js@13.17` and backport `discord.js@14.21.0`</strong>

- djs-selfbot-v13 is a [Node.js](https://nodejs.org) module that allows user accounts to interact with the Discord API v9.

> [!IMPORTANT]
> **This project is a fork of the [discord.js-selfbot-v13](https://github.com/aiko-chan-ai/discord.js-selfbot-v13) archived project.**


<div align="center">
  <p>
    <a href="https://www.npmjs.com/package/djs-selfbot-v13"><img src="https://img.shields.io/npm/v/djs-selfbot-v13.svg" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/djs-selfbot-v13"><img src="https://img.shields.io/npm/dt/djs-selfbot-v13.svg" alt="npm downloads" /></a>
    <a href="https://github.com/002-sans/djs-selfbot-v13/actions"><img src="https://github.com/002-sans/djs-selfbot-v13/actions/workflows/lint.yml/badge.svg" alt="Tests status" /></a>
  </p>
</div>

<details>
<summary><strong>New Features</strong></summary>

### Guild Management
- `guild.mute(options?)` - Mute a guild completely (suppress all notifications)
- `guild.unmute()` - Unmute a guild (restore all notifications)
- `guild.markRead(readStates?)` - Mark all channels in a guild as read

### Developer Applications
- `client.developers.get(withTeamApplications?)` - Fetch all developer applications owned by the user
- `client.developers.list(withTeamApplications?)` - Alias for get() method
- `client.developers.fetch(applicationId)` - Fetch a specific application by ID
- `client.developers.edit(applicationId, data)` - Edit an application with custom data
- `client.developers.setAvatar(applicationId, avatar)` - Set application avatar/icon
- `client.developers.setName(applicationId, name)` - Set application name
- `client.developers.setDescription(applicationId, description)` - Set application description
- `client.developers.setTags(applicationId, tags)` - Set application tags (max 5)
- `client.developers.addTag(applicationId, tag)` - Add a single tag to application
- `client.developers.delTag(applicationId, tag)` - Remove a tag from application
- `client.developers.enableIntents(applicationId)` - Enable bot intents for application
- `client.developers.disableIntents(applicationId)` - Disable bot intents for application

**Application Object Methods (Direct Usage):**
- `application.edit(data)` - Edit the application
- `application.setAvatar(avatar)` - Set application avatar/icon
- `application.setName(name)` - Set application name
- `application.setDescription(description)` - Set application description
- `application.setTags(tags)` - Set application tags (max 5)
- `application.addTag(tag)` - Add a single tag
- `application.delTag(tag)` - Remove a tag
- `application.enableIntents()` - Enable bot intents
- `application.disableIntents()` - Disable bot intents

### RPC Enhancements
- `rpc.setDetailsURL(url)` - Set a URL for RPC details (now fully functional)
- `rpc.setStateURL(url)` - Set a URL for RPC state (now fully functional)
- `rpc.details_url` - Property to access the details URL
- `rpc.state_url` - Property to access the state URL

### User Profile Customization
- `client.user.setNameStyle(fontName, effectName, color1, color2?)` - Set display name style with font, effect and colors
- `client.user.setClan(GuildID)` - Change your server clan tag
- `client.user.deleteClan()` - Remove server clan tag

### Profile Widgets
- `client.user.addWidget(type, gameId, comment?, tags?)` - Add a game widget to profile
- `client.user.delWidget(type, gameId?)` - Remove a widget or specific game
- `client.user.widgetsList()` - Get list of all widgets

### Quest System
- `client.quests.get()` - Fetch all available quests
- `client.quests.orbs()` - Get virtual currency balance
- `client.quests.acceptQuest(questId, options?)` - Accept a quest
- `client.quests.doingQuest(quest)` - Auto-complete a quest
- `client.quests.autoCompleteAll()` - Auto-complete all valid quests
- `client.quests.getCompleted()` - Get completed quests
- `client.quests.getClaimable()` - Get claimable quests
- `client.quests.filterQuestsValid()` - Filter valid quests

### Message Search
- `channel.search(options?)` - Search for messages in a channel with advanced filters
  - `authorId` - Search by specific author
  - `mentions` - Search for messages mentioning a user
  - `has` - Search for messages containing: `image`, `video`, `link`, `embed`, `sound`, `poll`, `sticker`, `snapshot`
  - `pinned` - Search only pinned messages
  - `sortBy` - Sort by `timestamp` or `relevance`
  - `sortOrder` - Sort order `desc` or `asc`
  - `offset` - Pagination offset
  - `limit` - Limit number of results
  - `maxTime` - Search for messages before a specific date/time

- `guild.search(options?)` - Search for messages across the entire guild with advanced filters
  - `channelId` - Search in a specific channel within the guild
  - All other options same as `channel.search()`


</details>

> [!WARNING]
> **I don't take any responsibility for blocked Discord accounts that used this module.**

> [!CAUTION]
> **Using this on a user account is prohibited by the [Discord TOS](https://discord.com/terms) and can lead to the account block.**

### <strong>[Document Website](https://discordjs-self-v13.netlify.app/)</strong>

### <strong>[Example Code](https://github.com/002-sans/djs-selfbot-v13/tree/main/examples)</strong>

## Features (User)
- [x] Message
- [x] ClientUser: Status, Activity, RemoteAuth, etc.
- [X] Guild: Fetch Members, Join / Leave, Top emojis, etc.
- [X] Interactions: Slash Commands, Buttons, Menu, Modal.
- [ ] Captcha & TOTP Handler
- [ ] Documentation
- [ ] Voice & Video
- [ ] Everything

## Installation

> [!NOTE]
> **Node.js 20.18.0 or newer is required**

```sh-session
npm install djs-selfbot-v13@latest
```

## Example

```js
const { Client } = require('djs-selfbot-v13');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);
})

client.login('token');
```


## Get Token ?

- Based: [findByProps](https://discord.com/channels/603970300668805120/1085682686607249478/1085682686607249478)

<strong>Run code (Discord Console - [Ctrl + Shift + I])</strong>

```js
window.webpackChunkdiscord_app.push([
	[Symbol()],
	{},
	req => {
		if (!req.c) return;
		for (let m of Object.values(req.c)) {
			try {
				if (!m.exports || m.exports === window) continue;
				if (m.exports?.getToken) return copy(m.exports.getToken());
				for (let ex in m.exports) {
					if (m.exports?.[ex]?.getToken && m.exports[ex][Symbol.toStringTag] !== 'IntlMessagesProxy') return copy(m.exports[ex].getToken());
				}
			} catch {}
		}
	},
]);

window.webpackChunkdiscord_app.pop();
console.log('%cWorked!', 'font-size: 50px');
console.log(`%cYou now have your token in the clipboard!`, 'font-size: 16px');
```

## Contributing

- Before creating an issue, please ensure that it hasn't already been reported/suggested, and double-check the
[documentation](https://discordjs-self-v13.netlify.app/).  
- See [the contribution guide](https://github.com/discordjs/discord.js/blob/main/.github/CONTRIBUTING.md) if you'd like to submit a PR.

## Need help?
Github Discussion: [Here](https://github.com/002-sans/djs-selfbot-v13/discussions)

## Credits
- [Discord.js](https://github.com/discordjs/discord.js)

## <strong>Other project(s)

- 📘 [***aiko-chan-ai/DiscordBotClient***](https://github.com/aiko-chan-ai/DiscordBotClient) <br/>
  A patched version of discord, with bot login support

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=002-sans/djs-selfbot-v13&type=Date)](https://star-history.com/#002-sans/djs-selfbot-v13&Date)
