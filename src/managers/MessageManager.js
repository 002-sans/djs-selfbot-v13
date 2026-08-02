'use strict';

const { Collection } = require('@discordjs/collection');
const CachedManager = require('./CachedManager');
const { TypeError } = require('../errors');
const { Message } = require('../structures/Message');
const MessagePayload = require('../structures/MessagePayload');
const Permissions = require('../util/Permissions');
const Util = require('../util/Util');

/**
 * Manages API methods for Messages and holds their cache.
 * @extends {CachedManager}
 */
class MessageManager extends CachedManager {
  constructor(channel, iterable) {
    super(channel.client, Message, iterable);

    /**
     * The channel that the messages belong to
     * @type {TextBasedChannels}
     */
    this.channel = channel;
  }

  /**
   * Format message edit debug block
   * @param {MessageResolvable} message The message to format debug for
   * @param {Error|null} [error=null] Error if any
   * @returns {string}
   * @private
   */
  _formatMessageEditDebug(message, error = null) {
    const messageId = this.resolveId(message);
    const targetMessage = message instanceof Message ? message : this.cache.get(messageId);

    const guildId = this.channel.guild?.id ?? 'DM/None';
    const channelId = this.channel.id;
    const messageAuthorId = targetMessage?.author?.id ?? 'Unknown (Not cached)';
    const botUserId = this.client.user?.id ?? 'Unknown';
    const channelType = this.channel.type ?? 'Unknown';

    const permissions = this.channel.guild ? this.channel.permissionsFor?.(this.client.user) : null;
    const viewChannel = permissions ? permissions.has(Permissions.FLAGS.VIEW_CHANNEL, false) : true;
    const sendMessages = permissions
      ? this.channel.isThread?.()
        ? permissions.has(Permissions.FLAGS.SEND_MESSAGES_IN_THREADS, false)
        : permissions.has(Permissions.FLAGS.SEND_MESSAGES, false)
      : true;
    const readMessageHistory = permissions ? permissions.has(Permissions.FLAGS.READ_MESSAGE_HISTORY, false) : true;
    const manageMessages = permissions ? permissions.has(Permissions.FLAGS.MANAGE_MESSAGES, false) : false;

    const messageEditable = targetMessage
      ? targetMessage.editable
      : messageAuthorId === botUserId || messageAuthorId === 'Unknown (Not cached)';
    const messageWebhook = targetMessage ? Boolean(targetMessage.webhookId) : false;
    const messageCached = Boolean(targetMessage);

    const errorMsg = error ? (error.message || String(error)) : 'None';
    const timestamp = new Date().toISOString();

    return `[MESSAGE EDIT DEBUG]

Guild ID: ${guildId}
Channel ID: ${channelId}
Message ID: ${messageId}
Message Author: ${messageAuthorId}
Bot User ID: ${botUserId}

Channel Type: ${channelType}

Permissions:
VIEW_CHANNEL: ${viewChannel}
SEND_MESSAGES: ${sendMessages}
READ_MESSAGE_HISTORY: ${readMessageHistory}
MANAGE_MESSAGES: ${manageMessages}

Message Editable: ${messageEditable}
Message Webhook: ${messageWebhook}
Message Cached: ${messageCached}

Error: ${errorMsg}
Timestamp: ${timestamp}`;
  }

  /**
   * Edits a message, even if it's not cached.
   * @param {MessageResolvable} message The message to edit
   * @param {string|MessageEditOptions|MessagePayload} options The options to edit the message
   * @returns {Promise<Message>}
   */
  async edit(message, options) {
    const messageId = this.resolveId(message);
    if (!messageId) throw new TypeError('INVALID_TYPE', 'message', 'MessageResolvable');

    if (!this._editQueues) this._editQueues = new Map();
    let queue = this._editQueues.get(messageId);
    if (!queue) {
      queue = Promise.resolve();
      this._editQueues.set(messageId, queue);
    }

    const performEdit = async () => {
      const targetMessage = message instanceof Message ? message : this.cache.get(messageId);
      const botUserId = this.client.user?.id;

      // 1. Ownership check (only original author can edit message content)
      if (targetMessage && targetMessage.author && botUserId && targetMessage.author.id !== botUserId) {
        const err = new Error(
          `[MESSAGE_EDIT_FAILED] Cannot edit message: Message was authored by user "${targetMessage.author.id}", but client is logged in as "${botUserId}". Only the original author can edit message content.`,
        );
        const debugInfo = this._formatMessageEditDebug(message, err);
        this.client.emit('debug', debugInfo);
        if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
          console.log(debugInfo);
        }
        throw err;
      }

      // 2. Webhook message check
      if (targetMessage && targetMessage.webhookId) {
        const err = new Error(
          `[MESSAGE_EDIT_FAILED] Cannot edit webhook message "${messageId}" via standard channel message edit endpoint.`,
        );
        const debugInfo = this._formatMessageEditDebug(message, err);
        this.client.emit('debug', debugInfo);
        if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
          console.log(debugInfo);
        }
        throw err;
      }

      // 3. Channel permission checks
      if (this.channel.guild) {
        const permissions = this.channel.permissionsFor(this.client.user);
        if (permissions) {
          if (!permissions.has(Permissions.FLAGS.VIEW_CHANNEL, false)) {
            const err = new Error(
              `[MESSAGE_EDIT_FAILED] Missing VIEW_CHANNEL permission in channel "${this.channel.id}".`,
            );
            const debugInfo = this._formatMessageEditDebug(message, err);
            this.client.emit('debug', debugInfo);
            if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
              console.log(debugInfo);
            }
            throw err;
          }

          const sendPerm = this.channel.isThread?.()
            ? Permissions.FLAGS.SEND_MESSAGES_IN_THREADS
            : Permissions.FLAGS.SEND_MESSAGES;

          if (!permissions.has(sendPerm, false)) {
            const err = new Error(
              `[MESSAGE_EDIT_FAILED] Missing ${
                this.channel.isThread?.() ? 'SEND_MESSAGES_IN_THREADS' : 'SEND_MESSAGES'
              } permission in channel "${this.channel.id}".`,
            );
            const debugInfo = this._formatMessageEditDebug(message, err);
            this.client.emit('debug', debugInfo);
            if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
              console.log(debugInfo);
            }
            throw err;
          }

          if (!permissions.has(Permissions.FLAGS.READ_MESSAGE_HISTORY, false)) {
            const err = new Error(
              `[MESSAGE_EDIT_FAILED] Missing READ_MESSAGE_HISTORY permission in channel "${this.channel.id}".`,
            );
            const debugInfo = this._formatMessageEditDebug(message, err);
            this.client.emit('debug', debugInfo);
            if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
              console.log(debugInfo);
            }
            throw err;
          }
        }
      }

      // 4. Thread state checks (Archived / Locked)
      if (this.channel.isThread?.()) {
        if (this.channel.archived) {
          const err = new Error(
            `[MESSAGE_EDIT_FAILED] Cannot edit message in archived thread "${this.channel.id}".`,
          );
          const debugInfo = this._formatMessageEditDebug(message, err);
          this.client.emit('debug', debugInfo);
          if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
            console.log(debugInfo);
          }
          throw err;
        }

        if (this.channel.locked) {
          const permissions = this.channel.permissionsFor(this.client.user);
          if (!permissions?.has(Permissions.FLAGS.MANAGE_THREADS, true)) {
            const err = new Error(
              `[MESSAGE_EDIT_FAILED] Cannot edit message in locked thread "${this.channel.id}" without MANAGE_THREADS permission.`,
            );
            const debugInfo = this._formatMessageEditDebug(message, err);
            this.client.emit('debug', debugInfo);
            if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
              console.log(debugInfo);
            }
            throw err;
          }
        }
      }

      // Format & emit debug before sending request
      const debugInfo = this._formatMessageEditDebug(message);
      this.client.emit('debug', debugInfo);
      if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
        console.log(debugInfo);
      }

      const { data, files } = await (options instanceof MessagePayload
        ? options
        : MessagePayload.create(message instanceof Message ? message : this, options)
      )
        .resolveData()
        .resolveFiles();

      const attachments = await Util.getUploadURL(this.client, this.channel.id, files);
      const requestPromises = attachments.map(async attachment => {
        await Util.uploadFile(files[attachment.id].file, attachment.upload_url);
        return {
          id: attachment.id,
          filename: files[attachment.id].name,
          uploaded_filename: attachment.upload_filename,
          description: files[attachment.id].description,
          duration_secs: files[attachment.id].duration_secs,
          waveform: files[attachment.id].waveform,
        };
      });
      const attachmentsData = await Promise.all(requestPromises);
      attachmentsData.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      data.attachments = attachmentsData;

      try {
        const d = await this.client.api.channels[this.channel.id].messages[messageId].patch({ data });

        const existing = this.cache.get(messageId);
        if (existing) {
          const clone = existing._clone();
          clone._patch(d);
          return clone;
        }
        return this._add(d);
      } catch (apiError) {
        const errDebug = this._formatMessageEditDebug(message, apiError);
        this.client.emit('debug', errDebug);
        if (this.client.options?.debugMessageEdit || process.env.DEBUG_MESSAGE_EDIT) {
          console.log(errDebug);
        }
        throw apiError;
      }
    };

    const nextPromise = queue.then(performEdit, performEdit);
    this._editQueues.set(messageId, nextPromise);

    try {
      return await nextPromise;
    } finally {
      if (this._editQueues.get(messageId) === nextPromise) {
        this._editQueues.delete(messageId);
      }
    }
  }

  /**
   * Publishes a message in an announcement channel to all channels following it, even if it's not cached.
   * @param {MessageResolvable} message The message to publish
   * @returns {Promise<Message>}
   */
  async crosspost(message) {
    message = this.resolveId(message);
    if (!message) throw new TypeError('INVALID_TYPE', 'message', 'MessageResolvable');

    const data = await this.client.api.channels(this.channel.id).messages(message).crosspost.post();
    return this.cache.get(data.id) ?? this._add(data);
  }

  /**
   * Pins a message to the channel's pinned messages, even if it's not cached.
   * @param {MessageResolvable} message The message to pin
   * @param {string} [reason] Reason for pinning
   * @returns {Promise<void>}
   */
  async pin(message, reason) {
    message = this.resolveId(message);
    if (!message) throw new TypeError('INVALID_TYPE', 'message', 'MessageResolvable');

    await this.client.api.channels(this.channel.id).messages.pins(message).put({ reason });
  }

  /**
   * Unpins a message from the channel's pinned messages, even if it's not cached.
   * @param {MessageResolvable} message The message to unpin
   * @param {string} [reason] Reason for unpinning
   * @returns {Promise<void>}
   */
  async unpin(message, reason) {
    message = this.resolveId(message);
    if (!message) throw new TypeError('INVALID_TYPE', 'message', 'MessageResolvable');

    await this.client.api.channels(this.channel.id).messages.pins(message).delete({ reason });
  }

  /**
   * Adds a reaction to a message, even if it's not cached.
   * @param {MessageResolvable} message The message to react to
   * @param {EmojiIdentifierResolvable} emoji The emoji to react with
   * @param {boolean} [burst=false] Super Reactions (Discord Nitro only)
   * @returns {Promise<void>}
   */
  async react(message, emoji, burst = false) {
    message = this.resolveId(message);
    if (!message) throw new TypeError('INVALID_TYPE', 'message', 'MessageResolvable');

    emoji = Util.resolvePartialEmoji(emoji);
    if (!emoji) throw new TypeError('EMOJI_TYPE', 'emoji', 'EmojiIdentifierResolvable');

    const emojiId = emoji.id
      ? `${emoji.animated ? 'a:' : ''}${emoji.name}:${emoji.id}`
      : encodeURIComponent(emoji.name);

    // eslint-disable-next-line newline-per-chained-call
    await this.client.api
      .channels(this.channel.id)
      .messages(message)
      .reactions(emojiId, '@me')
      .put({
        query: {
          type: burst ? 1 : 0,
        },
      });
  }

  /**
   * Deletes a message, even if it's not cached.
   * @param {MessageResolvable} message The message to delete
   * @returns {Promise<void>}
   */
  async delete(message) {
    message = this.resolveId(message);
    if (!message) throw new TypeError('INVALID_TYPE', 'message', 'MessageResolvable');

    await this.client.api.channels(this.channel.id).messages(message).delete();
  }

  _fetchId(messageId, cache, force) {
    if (!force) {
      const existing = this.cache.get(messageId);
      if (existing && !existing.partial) return existing;
    }

    // https://discord.com/api/v9/channels/:id/messages?limit=50&around=:msgid
    return new Promise((resolve, reject) => {
      this._fetchMany(
        {
          around: messageId,
          limit: 50,
        },
        cache,
      )
        .then(data_ =>
          data_.has(messageId) ? resolve(data_.get(messageId)) : reject(new Error('MESSAGE_ID_NOT_FOUND')),
        )
        .catch(reject);
    });
  }

  /**
   * @typedef {object} MessageSearchOptions
   * @property {Array<UserResolvable>} [authors] An array of author to filter by
   * @property {Array<UserResolvable>} [mentions] An array of user (mentioned) to filter by
   * @property {string} [content] A messageContent to filter by
   * @property {Snowflake} [maxId] The maximum Message ID to filter by
   * @property {Snowflake} [minId] The minimum Message ID to filter by
   * @property {Array<TextChannelResolvable>} [channels] An array of channel to filter by
   * @property {boolean} [pinned] Whether to filter by pinned messages
   * @property {Array<string>} [has] Message has: `link`, `embed`, `file`, `video`, `image`, or `sound`
   * @property {boolean} [nsfw=false] Whether to filter by NSFW channels
   * @property {number} [offset=0] The number of messages to skip (for pagination, 25 results per page)
   * @property {number} [limit=25] The number of messages to fetch
   * <info>The maximum limit allowed is 25.</info>
   * @property {string} [sortBy] The order to sort by (`timestamp` or `relevance`)
   * @property {string} [sortOrder] The order to return results in (`asc` or `desc`)
   * <info>The default sort is <code>timestamp</code> in descending order <code>desc</code> (newest first).</info>
   */

  /**
   * @typedef {object} MessageSearchResult
   * @property {Collection<Snowflake, Message>} messages A collection of found messages
   * @property {number} total The total number of messages that match the search criteria
   */

  /**
   * Search Messages in the channel.
   * @param {MessageSearchOptions} options Performs a search within the channel.
   * @returns {MessageSearchResult}
   */
  async search(options = {}) {
    // eslint-disable-next-line no-unused-vars
    let { authors, content, mentions, has, maxId, minId, channels, pinned, nsfw, offset, limit, sortBy, sortOrder } =
      Object.assign(
        {
          authors: [],
          content: '',
          mentions: [],
          has: [],
          maxId: null,
          minId: null,
          channels: [],
          pinned: false,
          nsfw: false,
          offset: 0,
          limit: 25,
          sortBy: 'timestamp',
          sortOrder: 'desc',
        },
        options,
      );
    // Validate
    if (authors.length > 0) authors = authors.map(u => this.client.users.resolveId(u));
    if (mentions.length > 0) mentions = mentions.map(u => this.client.users.resolveId(u));
    if (channels.length > 0) {
      channels = channels
        .map(c => this.client.channels.resolveId(c))
        .filter(id => {
          if (this.channel.guildId) {
            const c = this.channel.guild.channels.cache.get(id);
            if (!c || !c.messages) return false;
            const perm = c.permissionsFor(this.client.user);
            if (!perm.has('READ_MESSAGE_HISTORY') || !perm.has('VIEW_CHANNEL')) return false;
            return true;
          } else {
            return true;
          }
        });
    }
    if (limit && limit > 25) throw new RangeError('MESSAGE_SEARCH_LIMIT');
    let stringQuery = [];
    const result = new Collection();
    let data;
    if (authors.length > 0) stringQuery.push(authors.map(id => `author_id=${id}`).join('&'));
    if (content && content.length) stringQuery.push(`content=${encodeURIComponent(content)}`);
    if (mentions.length > 0) stringQuery.push(mentions.map(id => `mentions=${id}`).join('&'));
    has = has.filter(v => ['link', 'embed', 'file', 'video', 'image', 'sound', 'sticker'].includes(v));
    if (has.length > 0) stringQuery.push(has.map(v => `has=${v}`).join('&'));
    if (maxId) stringQuery.push(`max_id=${maxId}`);
    if (minId) stringQuery.push(`min_id=${minId}`);
    if (nsfw) stringQuery.push('include_nsfw=true');
    if (offset !== 0) stringQuery.push(`offset=${offset}`);
    if (limit !== 25) stringQuery.push(`limit=${limit}`);
    if (['timestamp', 'relevance'].includes(options.sortBy)) {
      stringQuery.push(`sort_by=${options.sortBy}`);
    } else {
      stringQuery.push('sort_by=timestamp');
    }
    if (['asc', 'desc'].includes(options.sortOrder)) {
      stringQuery.push(`sort_order=${options.sortOrder}`);
    } else {
      stringQuery.push('sort_order=desc');
    }
    if (this.channel.guildId && channels.length > 0) {
      stringQuery.push(channels.map(id => `channel_id=${id}`).join('&'));
    }
    if (typeof pinned == 'boolean') stringQuery.push(`pinned=${pinned}`);
    // Main
    if (!stringQuery.length) {
      return {
        messages: result,
        total: 0,
      };
    }
    if (this.channel.guildId) {
      data = await this.client.api.guilds[this.channel.guildId].messages[`search?${stringQuery.join('&')}`].get();
    } else {
      stringQuery = stringQuery.filter(v => !v.startsWith('channel_id') && !v.startsWith('include_nsfw'));
      data = await this.client.api.channels[this.channel.id].messages[`search?${stringQuery.join('&')}`].get();
    }

    for await (const message of data.messages) result.set(message[0].id, new Message(this.client, message[0]));
    return {
      messages: result,
      total: data.total_results,
    };
  }

  async _fetchMany(options = {}, cache) {
    const data = await this.client.api.channels[this.channel.id].messages.get({ query: options });
    const messages = new Collection();
    for (const message of data) messages.set(message.id, this._add(message, cache));
    return messages;
  }

  /**
   * Ends a poll.
   * @param {Snowflake} messageId The id of the message
   * @returns {Promise<Message>}
   */
  async endPoll(messageId) {
    const message = await this.client.api.channels(this.channel.id).polls(messageId).expire.post();
    return this._add(message, false);
  }

  /**
   * Options used for fetching voters of an answer in a poll.
   * @typedef {BaseFetchPollAnswerVotersOptions} FetchPollAnswerVotersOptions
   * @param {Snowflake} messageId The id of the message
   * @param {number} answerId The id of the answer
   */

  /**
   * Fetches the users that voted for a poll answer.
   * @param {FetchPollAnswerVotersOptions} options The options for fetching the poll answer voters
   * @returns {Promise<Collection<Snowflake, User>>}
   */
  async fetchPollAnswerVoters({ messageId, answerId, after, limit }) {
    const voters = await this.client.channels(this.channel.id).polls(messageId).answers(answerId).get({
      query: { limit, after },
    });

    return voters.users.reduce((acc, user) => acc.set(user.id, this.client.users._add(user, false)), new Collection());
  }
}

module.exports = MessageManager;
