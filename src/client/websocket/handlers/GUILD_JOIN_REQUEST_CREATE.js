'use strict';

module.exports = (client, packet) => {
  client.actions.GuildJoinRequestCreate.handle(packet.d);
};
