'use strict';

const { randomUUID } = require('node:crypto');
const { fetch } = require('undici');
const { Collection } = require('@discordjs/collection');
const WsVoiceSession = require('../client/voice/WsVoiceSession');
const BaseManager = require('./BaseManager');

const TASK_TYPES = [
  'WATCH_VIDEO',
  'PLAY_ON_DESKTOP',
  'PLAY_ON_XBOX',
  'PLAY_ON_PLAYSTATION',
  'STREAM_ON_DESKTOP',
  'PLAY_ACTIVITY',
  'WATCH_VIDEO_ON_MOBILE',
  'ACHIEVEMENT_IN_ACTIVITY',
];

/**
 * Represents a single quest
 */
class Quest {
  constructor(data) {
    this.id = data.id;
    this.config = data.config;
    this.userStatus = data.user_status;
    this._raw = data;
  }

  /**
   * Raw quest data from the API
   * @returns {Object}
   */
  get raw() {
    return this._raw;
  }

  /**
   * Check if quest is expired
   * @param {Date} [date=new Date()] Date to check against
   * @returns {boolean}
   */
  isExpired(date = new Date()) {
    if (!this.config.expires_at) return false;
    return new Date(this.config.expires_at) < date;
  }

  /**
   * Check if quest is completed
   * @returns {boolean}
   */
  isCompleted() {
    return this.userStatus?.completed_at != null;
  }

  /**
   * Check if quest rewards have been claimed
   * @returns {boolean}
   */
  hasClaimedRewards() {
    return this.userStatus?.claimed_at != null;
  }

  /**
   * Check if user is enrolled in quest
   * @returns {boolean}
   */
  isEnrolledQuest() {
    return this.userStatus?.enrolled_at != null;
  }

  /**
   * Update user status for this quest
   * @param {Object} status New status data
   */
  updateUserStatus(status) {
      if (!status) return;

    if (status.user_status) {
      this.updateUserStatus(status.user_status);
      return;
    }

    const previous = this.userStatus ?? {};
    this.userStatus = { ...previous, ...status };

    if (status.progress) {
      this.userStatus.progress = { ...previous.progress };
      for (const [task, data] of Object.entries(status.progress)) {
        this.userStatus.progress[task] = { ...previous.progress?.[task], ...data };
      }
    }

    this._raw.user_status = this.userStatus;
  }
}

/**
 * Manages API methods for Discord quests
 * @extends {BaseManager}
 */
class QuestManager extends BaseManager {
  constructor(client) {
    super(client);

    /**
     * Collection of cached quests
     * @type {Collection<string, Quest>}
     */
    this.cache = new Collection();
  }

  /**
   * Get task configuration (prefers v2)
   * @param {Quest} quest Quest instance
   * @returns {Object|undefined}
   * @private
   */
  _getTaskConfig(quest) {
    return quest.config.task_config_v2 ?? quest.config.task_config;
  }

  /**
   * Find the active task type for a quest
   * @param {Object} taskConfig Task configuration
   * @returns {string|null}
   * @private
   */
  _findTaskName(taskConfig) {
    if (!taskConfig?.tasks) return null;
    return TASK_TYPES.find(taskName => taskConfig.tasks[taskName] != null) ?? null;
  }

  /**
   * Check if a quest task has reached its target
   * @param {Quest} quest Quest instance
   * @param {string} taskName Task type
   * @param {number} target Target value in seconds
   * @returns {boolean}
   * @private
   */
  _isTaskComplete(quest, taskName, target) {
    if (quest.isCompleted()) return true;
    const value = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    return value >= target;
  }

  /**
   * Resolve a stream key for PLAY_ACTIVITY quests
   * @returns {string|null}
   * @private
   */
  _getActivityStreamKey() {
    const { client } = this;

    if (client.options.questVoiceChannelId) {
      const channel = client.channels.cache.get(client.options.questVoiceChannelId);
      if (channel) {
        return WsVoiceSession.getStreamKey(channel, client.user.id);
      }
    }

    const dmChannel = client.channels.cache.find(c => c.type === 'DM' || c.type === 'GROUP_DM');
    if (dmChannel) {
      return `call:${dmChannel.id}:${client.user.id}`;
    }

    for (const guild of client.guilds.cache.values()) {
      const voiceChannel = guild.channels.cache.find(
        c => c.type === 'GUILD_VOICE' || c.type === 'GUILD_STAGE_VOICE',
      );
      if (voiceChannel) {
        return `guild:${guild.id}:${voiceChannel.id}:${client.user.id}`;
      }
    }

    return null;
  }

  /**
   * Resolve a voice channel id for stream/activity quests
   * @returns {string|null}
   * @private
   */
  _resolveVoiceChannelId() {
    const { client } = this;

    if (client.options.questVoiceChannelId) {
      return client.options.questVoiceChannelId;
    }

    const streamKey = this._getActivityStreamKey();
    if (!streamKey) return null;

    const parts = streamKey.split(':');
    return parts[0] === 'guild' ? parts[2] : parts[1];
  }

  /**
   * Check if quest requires Android enrollment
   * @param {Quest} quest Quest instance
   * @returns {boolean}
   * @private
   */
  _isAndroidQuest(quest) {
    const taskConfig = this._getTaskConfig(quest);
    return Boolean(taskConfig?.tasks?.WATCH_VIDEO_ON_MOBILE) && !Boolean(taskConfig?.tasks?.WATCH_VIDEO);
  }

  /**
   * Build Android-specific request headers
   * @returns {Object}
   * @private
   */
  _getAndroidHeaders() {
    const androidProperties = {
      os: 'Android',
      browser: 'Discord Android',
      device: 'b0q',
      system_locale: 'en-US',
      has_client_mods: false,
      client_version: '316.11 - rn',
      release_channel: 'googleRelease',
      device_vendor_id: randomUUID(),
      design_id: 2,
      browser_user_agent: '',
      browser_version: '',
      os_version: '28',
      client_build_number: 5169,
      client_event_source: null,
      client_launch_id: randomUUID(),
      launch_signature: Date.now().toString(),
      client_app_state: 'active',
      client_heartbeat_session_id: randomUUID(),
    };

    return {
      'User-Agent': 'Discord-Android/316011;RNA',
      'x-super-properties': Buffer.from(JSON.stringify(androidProperties)).toString('base64'),
      'sec-ch-ua-mobile': '?1',
    };
  }

  /**
   * Get all available quests for the user
   * @returns {Promise<Object>} Quest data
   */
  async get() {
    const data = await this.client.api.quests('@me').get();

    if (data.quests) {
      this.cache.clear();
      data.quests.forEach(questData => {
        const quest = new Quest(questData);
        this.cache.set(quest.id, quest);
      });
    }

    return data;
  }

  /**
   * Get user's orb balance (virtual currency)
   * @returns {Promise<Object>} Balance data
   */
  async orbs() {
    return this.client.api.users['@me']['virtual-currency'].balance.get();
  }

  /**
   * Get quest by ID from cache
   * @param {string} id Quest ID
   * @returns {Quest|undefined}
   */
  getQuest(id) {
    return this.cache.get(id);
  }

  /**
   * Get all cached quests as array
   * @returns {Quest[]}
   */
  list() {
    return Array.from(this.cache.values());
  }

  /**
   * Get expired quests
   * @param {Date} [date=new Date()] Date to check against
   * @returns {Quest[]}
   */
  getExpired(date = new Date()) {
    return this.list().filter(quest => quest.isExpired(date));
  }

  /**
   * Get completed quests
   * @returns {Quest[]}
   */
  getCompleted() {
    return this.list().filter(quest => quest.isCompleted());
  }

  /**
   * Get claimable quests (completed but not claimed)
   * @returns {Quest[]}
   */
  getClaimable() {
    return this.list().filter(quest => quest.isCompleted() && !quest.hasClaimedRewards());
  }

  /**
   * Get valid quests (not completed, not expired)
   * @returns {Quest[]}
   */
  filterQuestsValid() {
    return this.list().filter(quest => !quest.isCompleted() && !quest.isExpired());
  }

  /**
   * Get quests ready to redeem
   * @returns {Quest[]}
   */
  filterQuestsValidToRedeem() {
    return this.getClaimable();
  }

  /**
   * Check if quest exists in cache
   * @param {string} id Quest ID
   * @returns {boolean}
   */
  hasQuest(id) {
    return this.cache.has(id);
  }

  /**
   * Get application data for given IDs
   * @param {string[]} ids Application IDs
   * @returns {Promise<Object[]>}
   */
  async getApplicationData(ids) {
    const query = new URLSearchParams();
    ids.forEach(id => query.append('application_ids', id));

    return this.client.api.applications.public.get({ query: query.toString() });
  }

  /**
   * Enroll in a specific quest
   * @param {string} questId The quest ID to enroll in
   * @param {Object} [options] Enrollment options
   * @param {number} [options.location] Location parameter
   * @param {boolean} [options.isTargeted=false] Whether the quest is targeted
   * @param {boolean} [options.isAndroid] Whether to enroll as Android client
   * @returns {Promise<Quest|undefined>} Updated quest or undefined
   */
  async acceptQuest(questId, options = {}) {
    let quest = this.getQuest(questId);
    const isAndroid = options.isAndroid ?? (quest ? this._isAndroidQuest(quest) : false);
    const { isTargeted = false } = options;
    const location = options.location ?? (isAndroid ? 12 : 11);

    const requestOptions = {
      data: {
        location,
        is_targeted: isTargeted,
        metadata_sealed: null,
        traffic_metadata_raw: quest?.raw?.traffic_metadata_raw ?? null,
        traffic_metadata_sealed: quest?.raw?.traffic_metadata_sealed ?? null,
      },
    };

    if (isAndroid) {
      requestOptions.headers = this._getAndroidHeaders();
    }

    const data = await this.client.api.quests(questId).enroll.post(requestOptions);

    if (!quest) {
      quest = new Quest({ id: questId, config: {}, user_status: data });
      this.cache.set(questId, quest);
    }

    quest.updateUserStatus(data);
    return quest;
  }

  /**
   * Update progress for a video quest
   * @param {string} questId The quest ID
   * @param {number} timestamp Current progress timestamp
   * @param {Object} [options] Request options
   * @param {boolean} [options.isAndroid=false] Whether to send as Android client
   * @returns {Promise<Object>} Progress update result
   */
  async videoProgress(questId, timestamp, options = {}) {
    const requestOptions = {
      data: { timestamp },
    };

    if (options.isAndroid) {
      requestOptions.headers = this._getAndroidHeaders();
    }

    return this.client.api.quests(questId)['video-progress'].post(requestOptions);
  }

  /**
   * Send heartbeat for desktop/activity quests
   * @param {string} questId The quest ID
   * @param {string|Object} applicationIdOrOptions Application ID or heartbeat options
   * @param {boolean} [terminal=false] Whether this is a terminal heartbeat
   * @returns {Promise<Object>} Heartbeat result
   */
  async heartbeat(questId, applicationIdOrOptions, terminal = false) {
    let body = { terminal };

    if (typeof applicationIdOrOptions === 'object' && applicationIdOrOptions !== null) {
      const { applicationId, streamKey, terminal: isTerminal = false } = applicationIdOrOptions;
      body.terminal = isTerminal;
      if (applicationId) body.application_id = applicationId;
      if (streamKey) body.stream_key = streamKey;
    } else {
      body.application_id = applicationIdOrOptions;
      body.terminal = terminal;
    }

    return this.client.api.quests(questId).heartbeat.post({ data: body });
  }

  /**
   * Claim rewards for a completed quest
   * @param {Quest|string} quest Quest instance or quest ID
   * @returns {Promise<Quest|undefined>}
   */
  async redeemQuest(quest) {
    if (typeof quest === 'string') {
      quest = this.getQuest(quest);
    }

    if (!quest) return undefined;

    if (!quest.isCompleted()) {
      throw new Error('Cannot redeem rewards for an incomplete quest.');
    }

    if (quest.hasClaimedRewards()) {
      throw new Error('Rewards for this quest have already been claimed.');
    }

    const platform = quest.config.rewards_config?.platforms?.[0] ?? null;
    const data = await this.client.api.quests(quest.id)['claim-reward'].post({
      data: {
        platform,
        location: 11,
        is_targeted: false,
        metadata_raw: null,
        metadata_sealed: null,
        traffic_metadata_raw: quest.raw?.traffic_metadata_raw ?? null,
        traffic_metadata_sealed: quest.raw?.traffic_metadata_sealed ?? null,
      },
    });

    quest.updateUserStatus(data);
    return quest;
  }

  /**
   * Helper function for timeout
   * @param {number} ms Milliseconds to wait
   * @returns {Promise<void>}
   * @private
   */
  async timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Complete a watch video quest
   * @param {Quest} quest Quest instance
   * @param {string} taskName Task type
   * @param {number} secondsNeeded Target seconds
   * @param {number} secondsDone Current progress
   * @param {boolean} isAndroid Whether this is a mobile quest
   * @returns {Promise<void>}
   * @private
   */
  async _doingWatchVideoQuest(quest, taskName, secondsNeeded, secondsDone, isAndroid) {
    const maxFuture = 10;
    const speed = 7;
    const interval = 7;
    const enrolledAt = new Date(quest.userStatus?.enrolled_at).getTime();
    let completed = false;

    while (true) {
      const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
      const diff = maxAllowed - secondsDone;
      const timestamp = secondsDone + speed;

      if (diff >= speed) {
        const res = await this.videoProgress(
          quest.id,
          Math.min(secondsNeeded, timestamp + Math.random()),
          { isAndroid },
        );
        completed = res.completed_at != null;
        quest.updateUserStatus(res);
        secondsDone = Math.min(secondsNeeded, timestamp);
      }

      if (timestamp >= secondsNeeded) break;

      await this.timeout(interval * 1000);
    }

    if (!completed) {
      const res = await this.videoProgress(quest.id, secondsNeeded, { isAndroid });
      quest.updateUserStatus(res);
    }
  }

  /**
   * Complete a play-on-platform quest
   * @param {Quest} quest Quest instance
   * @param {string} taskName Task type
   * @param {number} secondsNeeded Target seconds
   * @returns {Promise<void>}
   * @private
   */
  async _doingPlayOnPlatformQuest(quest, taskName, secondsNeeded) {
    const interval = 20;
    const applicationId = quest.config.application?.id;

    if (!applicationId) {
      throw new Error(`Missing application ID for quest "${quest.config.messages?.quest_name ?? quest.id}".`);
    }

    while (!this._isTaskComplete(quest, taskName, secondsNeeded)) {
      const res = await this.heartbeat(quest.id, { applicationId, terminal: false });
      quest.updateUserStatus(res);

      if (!this._isTaskComplete(quest, taskName, secondsNeeded)) {
        await this.timeout(interval * 1000);
      }
    }

    const res = await this.heartbeat(quest.id, { applicationId, terminal: true });
    quest.updateUserStatus(res);
  }

  /**
   * Complete a play activity quest
   * @param {Quest} quest Quest instance
   * @param {string} taskName Task type
   * @param {number} secondsNeeded Target seconds
   * @returns {Promise<void>}
   * @private
   */
  async _doingPlayActivityQuest(quest, taskName, secondsNeeded) {
    const interval = 20;
    const channelId = this._resolveVoiceChannelId();
    let voice;
    let streamKey = this._getActivityStreamKey();

    if (channelId) {
      voice = await this.client.voice.joinWsVoice(channelId, {
        mute: true,
        deaf: true,
        stream: true,
      });
      streamKey = voice.streamKey;
    }

    if (!streamKey) {
      throw new Error(
        `No voice or DM channel available for PLAY_ACTIVITY quest "${quest.config.messages?.quest_name ?? quest.id}".`,
      );
    }

    try {
      while (!this._isTaskComplete(quest, taskName, secondsNeeded)) {
        const res = await this.heartbeat(quest.id, { streamKey, terminal: false });
        quest.updateUserStatus(res);

        if (!this._isTaskComplete(quest, taskName, secondsNeeded)) {
          await this.timeout(interval * 1000);
        }
      }

      const res = await this.heartbeat(quest.id, { streamKey, terminal: true });
      quest.updateUserStatus(res);
    } finally {
      await voice?.disconnect().catch(() => null);
    }
  }

  /**
   * Complete a stream-on-desktop quest using gateway-only voice
   * @param {Quest} quest Quest instance
   * @param {string} taskName Task type
   * @param {number} secondsNeeded Target seconds
   * @returns {Promise<void>}
   * @private
   */
  async _doingStreamOnDesktopQuest(quest, taskName, secondsNeeded) {
    const channelId = this._resolveVoiceChannelId();

    if (!channelId) {
      throw new Error(
        `No voice channel configured for stream quest "${quest.config.messages?.quest_name ?? quest.id}". Set client option questVoiceChannelId.`,
      );
    }

    const interval = 20;
    let voice;

    try {
      voice = await this.client.voice.joinWsVoice(channelId, {
        mute: true,
        deaf: true,
        video: false,
        stream: true,
      });

      const streamKey = voice.streamKey;

      while (!this._isTaskComplete(quest, taskName, secondsNeeded)) {
        const res = await this.heartbeat(quest.id, { streamKey, terminal: false });
        quest.updateUserStatus(res);

        if (!this._isTaskComplete(quest, taskName, secondsNeeded)) {
          await this.timeout(interval * 1000);
        }
      }

      const res = await this.heartbeat(quest.id, { streamKey, terminal: true });
      quest.updateUserStatus(res);
    } finally {
      await voice?.disconnect().catch(() => null);
    }
  }

  /**
   * Complete an achievement in activity quest
   * @param {Quest} quest Quest instance
   * @returns {Promise<void>}
   * @private
   */
  async _doingAchievementInActivityQuest(quest) {
    const applicationId = quest.config.application?.id;
    const applicationName = quest.config.application?.name ?? applicationId;
    const questTarget = this._getTaskConfig(quest)?.tasks?.ACHIEVEMENT_IN_ACTIVITY?.target;

    if (!applicationId || !questTarget) {
      throw new Error(`Invalid achievement quest configuration for "${applicationName}".`);
    }

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: applicationId,
      scope: 'identify applications.commands applications.entitlements',
      state: '',
    });

    const authResponse = await this.client.api.oauth2.authorize.post({
      query: Object.fromEntries(query),
      data: {
        permissions: '0',
        authorize: true,
        integration_type: 1,
        location_context: {
          guild_id: '10000',
          channel_id: '10000',
          channel_type: 10000,
        },
      },
    });

    let authCode = null;
    if (authResponse?.location) {
      authCode = new URL(authResponse.location).searchParams.get('code');
    }

    if (!authCode) {
      throw new Error(`No auth code received for application ${applicationName}.`);
    }

    const tokenResponse = await fetch(`https://${applicationId}.discordsays.com/.proxy/acf/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: authCode }),
    }).then(res => res.json());

    if (!tokenResponse?.token) {
      throw new Error(`Failed to authorize with Discord Says for application ${applicationName}.`);
    }

    const progressResponse = await fetch(`https://${applicationId}.discordsays.com/.proxy/acf/quest/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': tokenResponse.token,
      },
      body: JSON.stringify({ progress: questTarget }),
    });

    if (!progressResponse.ok) {
      throw new Error(`Failed to progress quest with Discord Says for application ${applicationName}.`);
    }

    const tokens = await this.client.api.oauth2.tokens.get();
    const tokenInfo = tokens.find(token => token.application?.id === applicationId);

    if (tokenInfo) {
      await this.client.api.oauth2.tokens(tokenInfo.id).delete().catch(() => {});
    }

    await this.get();
  }

  /**
   * Complete a quest automatically
   * @param {Quest} quest Quest to complete
   * @returns {Promise<void>}
   */
  async doingQuest(quest) {
    if (!(quest instanceof Quest)) {
      quest = new Quest(quest);
    }

    const questName = quest.config.messages?.quest_name || 'Unknown Quest';
    const isAndroid = this._isAndroidQuest(quest);
    const taskConfig = this._getTaskConfig(quest);
    const taskName = this._findTaskName(taskConfig);

    if (!taskName) {
      console.log(`Unknown task type for quest "${questName}"`);
      return;
    }

    if (!quest.isEnrolledQuest()) {
      try {
        const enrolledQuest = await this.acceptQuest(quest.id, { isAndroid });
        if (enrolledQuest) quest = enrolledQuest;
      } catch (error) {
        console.error(`Failed to enroll in quest "${questName}":`, error);
        return;
      }
    }

    const secondsNeeded = taskConfig.tasks[taskName].target;
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    switch (taskName) {
      case 'WATCH_VIDEO':
      case 'WATCH_VIDEO_ON_MOBILE':
        await this._doingWatchVideoQuest(quest, taskName, secondsNeeded, secondsDone, isAndroid);
        break;

      case 'PLAY_ON_XBOX':
      case 'PLAY_ON_PLAYSTATION':
      case 'PLAY_ON_DESKTOP':
        await this._doingPlayOnPlatformQuest(quest, taskName, secondsNeeded);
        break;

      case 'PLAY_ACTIVITY':
        await this._doingPlayActivityQuest(quest, taskName, secondsNeeded);
        break;

      case 'ACHIEVEMENT_IN_ACTIVITY':
        await this._doingAchievementInActivityQuest(quest);
        break;

      case 'STREAM_ON_DESKTOP':
        await this._doingStreamOnDesktopQuest(quest, taskName, secondsNeeded);
        break;

      default:
        console.log(`Unsupported task type "${taskName}" for quest "${questName}".`);
    }
  }

  /**
   * Auto-complete all valid quests
   * @param {Object} [options] Options
   * @param {boolean} [options.redeem=false] Whether to redeem rewards after completion
   * @returns {Promise<void>}
   */
  async autoCompleteAll(options = {}) {
    await this.get();
    const validQuests = this.filterQuestsValid();

    for (const quest of validQuests) {
      try {
        await this.doingQuest(quest);
      } catch (error) {
        console.error(`Failed to complete quest ${quest.id}:`, error);
      }
    }

    if (options.redeem) {
      await this.get();
      for (const quest of this.filterQuestsValidToRedeem()) {
        try {
          await this.redeemQuest(quest);
        } catch (error) {
          console.error(`Failed to redeem quest ${quest.id}:`, error);
        }
      }
    }
  }

  /**
   * Get cache size
   * @type {number}
   * @readonly
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Clear quest cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Make QuestManager iterable
   * @returns {IterableIterator<Quest>}
   */
  [Symbol.iterator]() {
    return this.cache.values();
  }
}

module.exports = QuestManager;
module.exports.Quest = Quest;
