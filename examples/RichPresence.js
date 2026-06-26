const { Client, RichPresence, CustomStatus, SpotifyRPC } = require('../src/index');
const client = new Client();

client.on('ready', async () => {
  console.log(`${client.user.username} is ready!`);
  const getExtendURL = await RichPresence.getExternal(
    client,
    '367827983903490050',
    'https://assets.ppy.sh/beatmaps/1550633/covers/list.jpg',
  );
  const status = new RichPresence(client)
    .setApplicationId('367827983903490050')
    .setType('PLAYING')
    .setURL('https://www.youtube.com/watch?v=5icFcPkVzMg')
    .setState('Arcade Game')
    .setName('osu!')
    .setDetails('MariannE - Yooh')
    .setParty({
      max: 8,
      current: 1,
    })
    .setStartTimestamp(Date.now())
    .setAssetsLargeImage(getExtendURL[0].external_asset_path)
    .setAssetsLargeText('Idle')
    .setAssetsSmallImage('373370493127884800')
    .setAssetsSmallText('click the circles')
    .setPlatform('desktop')
    .addButton('Beatmap', 'https://osu.ppy.sh/beatmapsets/1391659#osu/2873429');

  const custom = new CustomStatus(client).setEmoji('😋').setState('yum');
  const spotify = new SpotifyRPC(client)
    .setAssetsLargeImage('spotify:ab67616d00001e02768629f8bc5b39b68797d1bb')
    .setAssetsSmallImage('spotify:ab6761610000f178049d8aeae802c96c8208f3b7')
    .setAssetsLargeText('未来茶屋 (vol.1)')
    .setState('Yunomi; Kizuna AI')
    .setDetails('ロボットハート')
    .setStartTimestamp(Date.now())
    .setEndTimestamp(Date.now() + 1_000 * (2 * 60 + 56))
    .setSongId('667eE4CFfNtJloC6Lvmgrx')
    .setAlbumId('6AAmvxoPoDbJAwbatKwMb9')
    .setArtistIds('2j00CVYTPx6q9ANbmB2keb', '2nKGmC5Mc13ct02xAY8ccS');

  client.user.setPresence({ activities: [status, custom, spotify] });
});

client.login('token');
