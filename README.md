
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

---

## Nouveautés

Comparé au module original [`discord.js-selfbot-v13`](https://github.com/aiko-chan-ai/discord.js-selfbot-v13) (v3.7.1), ce fork ajoute de nouvelles classes, managers, méthodes et options. Voici la liste exhaustive.

### Nouveaux exports (`src/index.js`)

| Export | Description |
|--------|-------------|
| `QuestManager` | Manager des quêtes Discord |
| `Quest` | Classe représentant une quête |
| `BackupManager` | Manager de sauvegarde/restauration de serveurs |
| `GuildJoinRequestManager` | Manager des demandes d'adhésion aux serveurs |
| `GuildJoinRequest` | Structure d'une demande d'adhésion |

---

### Client (`client.quests`, `client.backups`, `client.developers`)

| Propriété / Méthode | Description |
|---------------------|-------------|
| `client.quests` | Instance de `QuestManager` |
| `client.backups` | Instance de `BackupManager` |
| `client.developers` | Instance de `DeveloperManager` |
| `client.startStream(options)` | Rejoint un salon vocal, lance un Go Live WebRTC et lit une vidéo |
| `client.login()` | Met à jour automatiquement les propriétés client (build number, User-Agent) avant la connexion |

#### `client.startStream(options)` — `StartStreamOptions`

| Option | Type | Description |
|--------|------|-------------|
| `guildId` | `Snowflake` | ID du serveur |
| `channelId` | `Snowflake` | ID du salon vocal |
| `url` | `string` | URL ou chemin de la vidéo |
| `fps` | `number` | Images par seconde |
| `height` | `number` | Hauteur vidéo |
| `width` | `number` | Largeur vidéo |
| `bitrate` | `number` | Bitrate vidéo (kbps, défaut: `5000`) |
| `bitrateMax` | `number` | Bitrate max |
| `audioBitrate` | `number` | Bitrate audio |
| `preset` | `string` | Preset x264 |
| `tune` | `string` | Tune x264 |
| `audio` | `boolean` | Inclure la piste audio |
| `video` | `boolean` | Webcam vs screenshare |
| `livestream` | `boolean` | Mode live source |
| `downloadHttp` | `boolean` | Télécharger les URLs HTTP localement |
| `encoder` | `'auto' \| 'amf' \| 'nvenc' \| 'qsv' \| 'software'` | Encodeur vidéo |
| `hardwareAcceleratedDecoding` | `boolean` | Décodage FFmpeg accéléré |
| `nvencPreset` | `string` | Preset NVENC (défaut: `'p1'`) |
| `preEncode` | `boolean` | Pré-encoder avant lecture |
| `goLive` | `boolean` | Mode WebRTC vs UDP |

---

### Options & propriétés client (`Options`, `ClientProperties`)

| Propriété / Méthode | Description |
|---------------------|-------------|
| `Options.fetchClientProperties()` | Récupère les dernières propriétés Discord (build number, version, etc.) |
| `Options.createDefault().questVoiceChannelId` | Salon vocal par défaut pour les quêtes stream/activité |
| `ClientProperties.fetchLatest(channel?)` | Scrape Discord web + manifest desktop pour le build actuel |
| `ClientProperties.awaitLatest(channel?)` | Retourne les propriétés en cache ou les récupère |
| `ClientProperties.ensureFetched(channel?)` | Lance la récupération en arrière-plan au démarrage |
| `ClientProperties.createRuntimeProperties(base)` | Génère les propriétés WS avec UUIDs + build info |
| `ClientProperties.applyCached(properties)` | Applique le build number, version, native build, User-Agent |
| `ClientProperties.applyToClientOptions(options)` | Met à jour `ws.properties` et `http.headers` au login |
| `ClientProperties.FALLBACK_WS_PROPERTIES` | Valeurs de repli si la récupération échoue |

---

### Quêtes (`client.quests`)

#### Classe `Quest`

| Méthode / Propriété | Description |
|---------------------|-------------|
| `id` | ID de la quête |
| `config` | Configuration de la quête |
| `userStatus` | Statut utilisateur (progression, enrollment, etc.) |
| `raw` | Données brutes de l'API |
| `isExpired(date?)` | La quête est expirée |
| `isCompleted()` | La quête est terminée |
| `hasClaimedRewards()` | Les récompenses ont été réclamées |
| `isEnrolledQuest()` | L'utilisateur est inscrit |
| `updateUserStatus(status)` | Met à jour le statut en cache |

#### `QuestManager`

| Méthode / Propriété | Description |
|---------------------|-------------|
| `cache` | `Collection<string, Quest>` |
| `get()` | Récupère toutes les quêtes (`/quests/@me`) |
| `orbs()` | Solde de monnaie virtuelle (Orbs) |
| `getQuest(id)` | Quête en cache par ID |
| `list()` | Toutes les quêtes en cache |
| `getExpired(date?)` | Quêtes expirées |
| `getCompleted()` | Quêtes terminées |
| `getClaimable()` | Quêtes terminées non réclamées |
| `filterQuestsValid()` | Quêtes non terminées et non expirées |
| `filterQuestsValidToRedeem()` | Alias pour `getClaimable()` |
| `hasQuest(id)` | Vérifie si la quête est en cache |
| `getApplicationData(ids)` | Métadonnées publiques des applications |
| `acceptQuest(questId, options?)` | S'inscrire à une quête (support Android) |
| `videoProgress(questId, timestamp, options?)` | Progression vidéo |
| `heartbeat(questId, appIdOrOptions, terminal?)` | Heartbeat desktop/activité/stream |
| `redeemQuest(quest)` | Réclamer les récompenses |
| `doingQuest(quest)` | Auto-compléter une quête |
| `autoCompleteAll({ redeem? })` | Auto-compléter toutes les quêtes valides |
| `size` | Taille du cache |
| `clear()` | Vider le cache |
| `[Symbol.iterator]()` | Itérer les quêtes en cache |

**Types de quêtes auto-complétables :**
- `WATCH_VIDEO` / `WATCH_VIDEO_ON_MOBILE`
- `PLAY_ON_DESKTOP` / `PLAY_ON_XBOX` / `PLAY_ON_PLAYSTATION`
- `PLAY_ACTIVITY`
- `STREAM_ON_DESKTOP` *(via voice WS-only)*
- `ACHIEVEMENT_IN_ACTIVITY`

```js
await client.quests.get();
const valid = client.quests.filterQuestsValid();
for (const quest of valid) {
  await client.quests.doingQuest(quest);
}
```

---

### Sauvegardes (`client.backups`)

#### `BackupManager`

| Propriété | Description |
|-----------|-------------|
| `cache` | Instance de `BackupCacheManager` |

#### `BackupCacheManager` (`client.backups.cache`)

| Méthode | Description |
|---------|-------------|
| `create(guildId, options?)` | Crée une sauvegarde du serveur |
| `load(guildId, backupId, options?)` | Restaure une sauvegarde |
| `get(backupId)` | Récupère une sauvegarde (`id`, `data`, `size`) |
| `list()` | Liste tous les IDs de sauvegarde |
| `delete(backupId)` | Supprime une sauvegarde |
| `clearAll()` | Supprime toutes les sauvegardes |

**Options `create` :** `backupID`, `maxMessagesPerChannel`, `doNotBackup`, `backupMembers`, `saveImages`  
**Options `load` :** `clearGuildBeforeRestore`, `maxMessagesPerChannel`, `doNotBackup`

```js
const backup = await client.backups.cache.create(guild.id, {
  maxMessagesPerChannel: 50,
  backupMembers: true,
});
await client.backups.cache.load(guild.id, backup.id);
```

---

### Demandes d'adhésion (`guild.demandes`)

#### `GuildJoinRequestManager` (`guild.demandes`)

| Méthode / Propriété | Description |
|---------------------|-------------|
| `cache` | `Collection<Snowflake, GuildJoinRequest>` |
| `resolve(request)` | Résout un resolvable en `GuildJoinRequest` |
| `resolveId(request)` | Résout en ID string |

#### `GuildJoinRequest`

| Propriété / Méthode | Description |
|---------------------|-------------|
| `id`, `userId`, `user`, `status`, `responses` | Données de la demande |
| `createdTimestamp`, `createdAt` | Date de création |
| `approuve()` | Approuver la demande |
| `reject(reason?)` | Rejeter la demande |
| `interview()` | Démarrer un entretien |

#### `Guild`

| Propriété | Description |
|-----------|-------------|
| `demandes` | `GuildJoinRequestManager` |
| `profile` | `{ badge, tag }` — profil/tag du serveur |

**Nouveaux événements :**
- `guildJoinRequestCreate` — nouvelle ou mise à jour de demande
- `guildJoinRequestDelete` — demande supprimée

---

### Applications développeur (`client.developers`)

| Méthode | Description |
|---------|-------------|
| `get(withTeamApplications?)` | Liste les applications possédées |
| `list(...)` | Alias de `get` |
| `fetch(applicationId)` | Récupère une application |
| `edit(applicationId, data)` | Modifie les métadonnées |
| `setAvatar(applicationId, avatar)` | Change l'icône |
| `setName(applicationId, name)` | Change le nom |
| `setDescription(applicationId, description)` | Change la description |
| `setTags(applicationId, tags)` | Définit les tags (max 5) |
| `addTag(applicationId, tag)` | Ajoute un tag |
| `delTag(applicationId, tag)` | Supprime un tag |
| `enableIntents(applicationId)` | Active les intents privilégiés |
| `disableIntents(applicationId)` | Désactive les intents privilégiés |

---

### ClientUser (profil utilisateur)

| Méthode | Description |
|---------|-------------|
| `setCustomStatus(options, shardId?)` | Statut personnalisé (texte, emoji, expiration) |
| `addWidget(type, gameId, comment?, tags?)` | Ajoute un widget profil (jeu en cours / récemment joué) |
| `delWidget(type, gameId?)` | Supprime un widget |
| `widgetsList()` | Liste les widgets du profil |
| `setNameStyle(fontName, effectName, color1, color2?)` | Style du nom (police, effet, dégradé) |
| `searchTab(options?)` | Recherche dans ses propres messages |
| `setClan(guild)` | Affiche le tag d'identité d'un serveur |
| `deleteClan()` | Supprime le tag d'identité |
| `fetchProfile(userId, options?)` | Profil complet (bio, bannière, badges, amis/guildes mutuels, widgets) |

---

### Voice — WS-only (`WsVoiceSession`)

Connexion vocale **uniquement via le gateway** (sans UDP). Idéal pour les quêtes stream/activité.

```js
const voice = await client.voice.joinWsVoice(channelId, {
  mute: true,
  deaf: true,
  video: true,
  stream: true,
});

await voice.setDeaf(true);
await voice.setMute(true);
await voice.setVideo(true);
await voice.setStream(true);
await voice.edit({ mute: true, deaf: true, video: false, stream: true });
await voice.disconnect();
```

| Méthode / Propriété | Description |
|---------------------|-------------|
| `ClientVoiceManager.joinWsVoice(channel, options?)` | Rejoint un salon via gateway uniquement |
| `ClientVoiceManager.wsSession` | Session WS active ou `null` |
| `ClientVoiceManager.preJoinCleanup(channel)` | Nettoie l'état vocal/stream avant join |
| `ClientVoiceManager.resetVoiceSession(channel)` | Force la déconnexion (récupération erreur 4006) |
| `ClientVoiceManager.joinChannelWithRetry(channel, config?, maxAttempts?)` | Join avec retry sur session expirée |
| `WsVoiceSession.streamKey` | Clé de stream Discord |
| `WsVoiceSession.disconnected` | Session terminée |
| `WsVoiceSession.setMute(mute?)` | Self mute (op 4) |
| `WsVoiceSession.setDeaf(deaf?)` | Self deaf (op 4) |
| `WsVoiceSession.setVideo(video?)` | Caméra on/off (op 4) |
| `WsVoiceSession.setStream(stream?)` | Go Live on/off (op 18 / 19) |
| `WsVoiceSession.edit(options)` | Met à jour plusieurs options |
| `WsVoiceSession.disconnect()` | Quitte le salon + arrête le stream |

**Options `joinWsVoice` :** `mute`, `deaf`, `video`, `stream`, `selfMute`, `selfDeaf`, `selfVideo`, `preferredRegion`

**Utilitaires exportés (`WsVoiceSession.js`) :**
- `getStreamKey(channel, userId)` — `guild:guildId:channelId:userId` ou `call:channelId:userId`
- `normalizeOptions(options)` — Normalise les alias d'options
- `waitForSelfVoiceState(client, predicate, timeout?)` — Attend un `VOICE_STATE_UPDATE`

---

### Voice — WebRTC Go Live (`WebRtcStreamSession`)

Utilisé par `client.startStream()`. Basé sur `@dank074/discord-video-stream`.

| Méthode / Événement | Description |
|---------------------|-------------|
| `start()` | Rejoint le vocal + démarre le stream WebRTC |
| `pause()` | Met en pause |
| `resume()` | Reprend |
| `stop()` | Arrête la lecture |
| `replay()` | Relit depuis le début |
| `disconnect()` | Arrête + quitte le vocal |
| `'playing'`, `'finish'`, `'error'`, `'debug'` | Événements de session |

Encodeur auto-détecté : `amf` → `nvenc` → `libx264`.

---

### Voice — Stream UDP (`StreamSession`)

Session de lecture vidéo via UDP (chemin legacy).

| Méthode | Description |
|---------|-------------|
| `StreamSession.resolveUrl(url)` | Télécharge une vidéo HTTP en fichier temporaire |
| `start()` | Démarre FFmpeg UDP |
| `pause()` / `resume()` / `stop()` / `replay()` | Contrôle de lecture |
| `disconnect()` | Arrête + déconnecte voice et stream |

---

### Voice — Chiffrement DAVE (`DAVESession`)

Chiffrement end-to-end audio/vidéo Discord via `@snazzah/davey`.

| Méthode / Propriété | Description |
|---------------------|-------------|
| `VoiceConnection.dave` | Instance `DAVESession` |
| `VoiceConnection.isDaveReady()` | Session DAVE prête |
| `VoiceConnection.waitForDaveReady()` | Attend que DAVE soit prêt |
| `VoiceConnection.getStreamSsrcs()` | `{ audioSsrc, videoSsrc, rtxSsrc }` |
| `VoiceConnection.stopExistingStream()` | Arrête proprement un screenshare actif |
| `DAVESession.voicePrivacyCode` | Code de confidentialité E2EE |
| `DAVESession.getVerificationCode(userId)` | Code de vérification par utilisateur |
| `DAVESession.reinit()` | Réinitialise la session MLS |
| `DAVESession.setExternalSender(data)` | Configure l'expéditeur externe MLS |
| `DAVESession.prepareTransition(data)` | Prépare une transition de protocole |
| `DAVESession.executeTransition(id)` | Exécute une transition |
| `DAVESession.prepareEpoch(data)` | Prépare une époque |
| `DAVESession.processProposals(payload, clients)` | Handshake MLS — propositions |
| `DAVESession.processCommit(payload)` | Handshake MLS — commit |
| `DAVESession.processWelcome(payload)` | Handshake MLS — welcome |
| `DAVESession.encrypt(packet)` | Chiffre un paquet audio |
| `DAVESession.encryptVideo(packet, codec?)` | Chiffre un paquet vidéo |
| `DAVESession.decrypt(packet, userId)` | Déchiffre un paquet |
| `DAVESession.destroy()` | Détruit la session |

**Nouveaux opcodes voice (`Constants.VoiceOpcodes`) :** `CLIENTS_CONNECT`, `DAVE_PREPARE_TRANSITION`, `DAVE_EXECUTE_TRANSITION`, `DAVE_TRANSITION_READY`, `DAVE_PREPARE_EPOCH`, `DAVE_MLS_*` (25–31)

---

### Voice — Salons vocaux

| Classe | Méthode / Propriété | Description |
|--------|---------------------|-------------|
| `BaseGuildVoiceChannel` | `status` | Statut du salon vocal (max 500 caractères) |
| `BaseGuildVoiceChannel` | `setStatus(status?)` | Définit ou supprime le statut (`PUT /channels/:id/voice-status`) |
| `VoiceChannel` | `setStatus(status?)` | Hérite de `BaseGuildVoiceChannel` |
| `StageChannel` | `setStatus(status?)` | Hérite de `BaseGuildVoiceChannel` |

```js
await voiceChannel.setStatus('Hello!');
await voiceChannel.setStatus(null); // supprimer
```

---

### Voice — Améliorations `VoiceConnection`

| Méthode | Description |
|---------|-------------|
| `setVideoStatus(value)` | Envoie le paquet `SOURCES` avec SSRC vidéo/RTX |
| `sendVoiceStateUpdate(options)` | Définit `flags: 2` quand `self_video` est actif |
| `checkAuthenticated()` | Vérifie `serverId` quand le protocole DAVE est actif |
| `cleanup()` | Nettoyage session DAVE / détection session partagée |
| `createStreamConnection()` | Crée une connexion stream UDP |
| `joinStreamConnection(user)` | Rejoint le stream d'un utilisateur |
| `StreamConnection.sendSignalScreenshare()` | Signal Go Live (op 18) |
| `StreamConnection.sendStopScreenshare()` | Arrêt stream (op 19) |
| `StreamConnection.sendScreenshareState(paused?)` | Pause/unpause stream (op 22) |

---

### Nouvelles dépendances

| Package | Usage |
|---------|-------|
| `@dank074/discord-video-stream` | Go Live WebRTC (`WebRtcStreamSession`, `client.startStream`) |
| `@snazzah/davey` | Chiffrement DAVE E2EE (`DAVESession`) |
| `debug` | Logging debug |

---

<div align="center">
  <p>
    <a href="https://www.npmjs.com/package/djs-selfbot-v13"><img src="https://img.shields.io/npm/v/djs-selfbot-v13.svg" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/djs-selfbot-v13"><img src="https://img.shields.io/npm/dt/djs-selfbot-v13.svg" alt="npm downloads" /></a>
    <a href="https://github.com/002-sans/djs-selfbot-v13/actions"><img src="https://github.com/002-sans/djs-selfbot-v13/actions/workflows/lint.yml/badge.svg" alt="Tests status" /></a>
  </p>
</div>

> [!WARNING]
> **I don't take any responsibility for blocked Discord accounts that used this module.**

> [!CAUTION]
> **Using this on a user account is prohibited by the [Discord TOS](https://discord.com/terms) and can lead to the account block.**

### <strong>[Document Website](https://discordjs-self-v13.netlify.app/)</strong>

### <strong>[Example Code](https://github.com/002-sans/djs-selfbot-v13/tree/main/examples)</strong>

## Features (User)
- [x] Message
- [x] ClientUser: Status, Activity, RemoteAuth, CustomStatus, Widgets, Clan, Profile, etc.
- [x] Guild: Fetch Members, Join / Leave, Top emojis, Join Requests, Profile tag, etc.
- [x] Interactions: Slash Commands, Buttons, Menu, Modal.
- [x] Quests: Auto-complete (video, desktop, activity, stream, achievement)
- [x] Voice WS-only: joinWsVoice, setMute, setDeaf, setVideo, setStream
- [x] Voice WebRTC: client.startStream (Go Live + vidéo)
- [x] Voice DAVE: Chiffrement E2EE audio/vidéo
- [x] Backups: Sauvegarde/restauration de serveurs
- [x] Developer: Gestion des applications bot
- [x] VoiceChannel.setStatus
- [x] ClientProperties: Build number automatique
- [ ] Captcha & TOTP Handler
- [ ] Documentation complète

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

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=002-sans/djs-selfbot-v13&type=Date)](https://star-history.com/#002-sans/djs-selfbot-v13&Date)
