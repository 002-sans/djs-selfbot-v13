'use strict';

const Base = require('./Base');

/**
 * Represents a join request in a guild.
 * @extends {Base}
 */
class GuildJoinRequest extends Base {
  constructor(client, data, guild) {
    super(client);

    /**
     * The guild this join request belongs to
     * @type {Guild}
     */
    this.guild = guild;

    /**
     * The ID of the guild this join request belongs to
     * @type {Snowflake}
     */
    this.guildId = guild?.id ?? data.guild_id;

    if (data) this._patch(data);
  }

  _patch(data) {
    if ('id' in data) {
      /**
       * The ID of the join request
       * @type {Snowflake}
       */
      this.id = data.id;
    }

    if ('user_id' in data) {
      /**
       * The ID of the user who made the join request
       * @type {Snowflake}
       */
      this.userId = data.user_id;
    }

    if ('user' in data) {
      /**
       * The user who made the join request
       * @type {?User}
       */
      this.user = this.client.users._add(data.user);
    } else {
      this.user ??= this.client.users.cache.get(this.userId) ?? null;
    }

    if ('application_status' in data) {
      /**
       * The status of the join request
       * @type {string}
       */
      this.status = data.application_status;
    } else if ('status' in data) {
      this.status = data.status;
    }

    if ('form_responses' in data) {
      /**
       * The responses to the guild's join form questions
       * @type {Array<{ question: string, answers: ?string }>}
       */
      this.responses = data.form_responses.map(r => ({
        question: r.label,
        answers: r.response ?? null,
      }));
    }

    if ('created_at' in data) {
      /**
       * The timestamp when the join request was created
       * @type {number}
       */
      this.createdTimestamp = new Date(data.created_at).getTime();
    }
  }

  /**
   * The date when the join request was created
   * @type {Date}
   * @readonly
   */
  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * Approves this join request.
   * @returns {Promise<GuildJoinRequest>}
   */
  async approuve() {
    await this.client.api.guilds(this.guildId).requests.id(this.id).patch({
      data: { action: 'APPROVED' },
    });
    return this;
  }

  /**
   * Rejects this join request.
   * @param {string} [reason] The reason for rejecting the request
   * @returns {Promise<GuildJoinRequest>}
   */
  async reject(reason) {
    await this.client.api.guilds(this.guildId).requests.id(this.id).patch({
      data: { action: 'REJECTED', rejection_reason: reason },
    });
    return this;
  }

  /**
   * Starts an interview for this join request.
   * @returns {Promise<GuildJoinRequest>}
   */
  async interview() {
    await this.client.api['join-requests'](this.id).interview.post();
    return this;
  }
}

module.exports = GuildJoinRequest;
