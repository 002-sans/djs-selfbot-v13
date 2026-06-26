'use strict';

const Action = require('./Action');
const { Events } = require('../../util/Constants');

class GuildJoinRequestDeleteAction extends Action {
  handle(data) {
    const client = this.client;
    const guildId = data.guild_id ?? data.request?.guild_id;
    const guild = client.guilds.cache.get(guildId);

    if (guild) {
      const userId = data.user_id ?? data.request?.user_id;
      const joinRequest = guild.demandes.cache.get(userId);
      guild.demandes.cache.delete(userId);

      /**
       * Emitted whenever a join request is deleted/cancelled.
       * @event Client#guildJoinRequestDelete
       * @param {GuildJoinRequest} joinRequest The deleted join request (or raw data if not cached)
       * @param {Guild} guild The guild
       */
      if (joinRequest) {
        client.emit(Events.GUILD_JOIN_REQUEST_DELETE, joinRequest);
      } else {
        // Emit with a minimal object even if not previously cached
        const GuildJoinRequest = require('../../structures/GuildJoinRequest');
        const requestData = data.request ?? data;
        if (!requestData.guild_id) requestData.guild_id = guildId;
        const newRequest = new GuildJoinRequest(client, requestData, guild);
        client.emit(Events.GUILD_JOIN_REQUEST_DELETE, newRequest);
      }

      return { joinRequest };
    }

    return {};
  }
}

module.exports = GuildJoinRequestDeleteAction;
