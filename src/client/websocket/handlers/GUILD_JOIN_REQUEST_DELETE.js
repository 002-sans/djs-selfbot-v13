'use strict';

module.exports = (client, packet) => {
  client.actions.GuildJoinRequestDelete.handle(packet.d);
};
