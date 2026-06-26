'use strict';

const CachedManager = require('./CachedManager');
const GuildJoinRequest = require('../structures/GuildJoinRequest');

/**
 * Manages API methods for Guild Join Requests and stores their cache.
 * @extends {CachedManager}
 */
class GuildJoinRequestManager extends CachedManager {
  constructor(guild, iterable) {
    super(guild.client, GuildJoinRequest, iterable);

    /**
     * The guild this manager belongs to
     * @type {Guild}
     */
    this.guild = guild;
  }

  /**
   * The cache of this Manager
   * @type {Collection<Snowflake, GuildJoinRequest>}
   * @name GuildJoinRequestManager#cache
   */

  _add(data, cache = true) {
    return super._add(data, cache, { id: data.user_id || data.request?.user_id, extras: [this.guild] });
  }

  /**
   * Resolves a {@link GuildJoinRequestResolvable} to a {@link GuildJoinRequest} object.
   * @param {GuildJoinRequestResolvable} request The join request to resolve
   * @returns {?GuildJoinRequest}
   */
  resolve(request) {
    if (request instanceof GuildJoinRequest) return request;
    if (typeof request === 'string') return this.cache.get(request) ?? null;
    return null;
  }

  /**
   * Resolves a {@link GuildJoinRequestResolvable} to a join request ID.
   * @param {GuildJoinRequestResolvable} request The join request to resolve
   * @returns {?Snowflake}
   */
  resolveId(request) {
    if (request instanceof GuildJoinRequest) return request.id;
    if (typeof request === 'string') return request;
    return null;
  }
}

module.exports = GuildJoinRequestManager;
