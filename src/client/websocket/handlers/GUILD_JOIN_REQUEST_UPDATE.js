'use strict';

module.exports = (client, packet) => {
  // UPDATE uses the same action as CREATE (upsert into cache)
  client.actions.GuildJoinRequestCreate.handle(packet.d);
};
