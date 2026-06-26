'use strict';

const Action = require('./Action');
const { Events } = require('../../util/Constants');

class GuildJoinRequestCreateAction extends Action {
  handle(data) {
    const client = this.client;
    const guildId = data.guild_id ?? data.request?.guild_id;
    const guild = client.guilds.cache.get(guildId);

    if (guild) {
      const requestData = data.request ?? data;
      // Ensure guild_id is present on the request data
      if (!requestData.guild_id) requestData.guild_id = guildId;
      // Pass status from top-level if present
      if (data.status && !requestData.application_status) {
        requestData.application_status = data.status;
      }
      const joinRequest = guild.demandes._add(requestData);

      /**
       * Emitted whenever a join request is created or updated.
       * @event Client#guildJoinRequestCreate
       * @param {GuildJoinRequest} joinRequest The join request
       */
      client.emit(Events.GUILD_JOIN_REQUEST_CREATE, joinRequest);

      return { joinRequest };
    }

    return {};
  }
}

module.exports = GuildJoinRequestCreateAction;
