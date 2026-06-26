'use strict';

const Base = require('./Base');
const VoiceState = require('./VoiceState');
const TextBasedChannel = require('./interfaces/TextBasedChannel');
const { Error } = require('../errors');
const { RelationshipTypes } = require('../util/Constants');
const SnowflakeUtil = require('../util/SnowflakeUtil');
const UserFlags = require('../util/UserFlags');
const Util = require('../util/Util');

/**
 * Represents a user on Discord.
 * @implements {TextBasedChannel}
 * @extends {Base}
 */
class User extends Base {
  constructor(client, data) {
    super(client);

    /**
     * The user's id
     * @type {Snowflake}
     */
    this.id = data.id;

    this.bot = null;
    this.system = null;
    this.flags = null;

    this._patch(data);
  }

  _patch(data) {
    if ('username' in data) {
      /**
       * The username of the user
       * @type {?string}
       */
      this.username = data.username;
    } else {
      this.username ??= null;
    }

    if ('global_name' in data) {
      /**
       * The global name of this user
       * @type {?string}
       */
      this.globalName = data.global_name;
    } else {
      this.globalName ??= null;
    }

    if ('bot' in data) {
      /**
       * Whether or not the user is a bot
       * @type {?boolean}
       */
      this.bot = Boolean(data.bot);
    } else if (!this.partial && typeof this.bot !== 'boolean') {
      this.bot = false;
    }

    if ('discriminator' in data) {
      /**
       * The discriminator of this user
       * <info>`'0'`, or a 4-digit stringified number if they're using the legacy username system</info>
       * @type {?string}
       */
      this.discriminator = data.discriminator;
    } else {
      this.discriminator ??= null;
    }

    if ('avatar' in data) {
      /**
       * The user avatar's hash
       * @type {?string}
       */
      this.avatar = data.avatar;
    } else {
      this.avatar ??= null;
    }

    if ('banner' in data) {
      /**
       * The user banner's hash
       * <info>The user must be force fetched for this property to be present or be updated</info>
       * @type {?string}
       */
      this.banner = data.banner;
    } else if (this.banner !== null) {
      this.banner ??= undefined;
    }

    if ('banner_color' in data) {
      /**
       * The user banner's hex color
       * <info>The user must be force fetched for this property to be present or be updated</info>
       * @type {?string}
       */
      this.bannerColor = data.banner_color;
    } else if (this.bannerColor !== null) {
      this.bannerColor ??= undefined;
    }

    if ('accent_color' in data) {
      /**
       * The base 10 accent color of the user's banner
       * <info>The user must be force fetched for this property to be present or be updated</info>
       * @type {?number}
       */
      this.accentColor = data.accent_color;
    } else if (this.accentColor !== null) {
      this.accentColor ??= undefined;
    }

    if ('system' in data) {
      /**
       * Whether the user is an Official Discord System user (part of the urgent message system)
       * @type {?boolean}
       */
      this.system = Boolean(data.system);
    } else if (!this.partial && typeof this.system !== 'boolean') {
      this.system = false;
    }

    if ('public_flags' in data) {
      /**
       * The flags for this user
       * @type {?UserFlags}
       */
      this.flags = new UserFlags(data.public_flags);
    }

    // ─── Display Name Styles ────────────────────────────────────────────────

    /**
     * @typedef {Object} DisplayNameStyles
     * @property {number} fontId   The font ID used for the display name
     * @property {number} effectId The effect ID applied to the display name
     * @property {number[]} colors  Array of decimal color values (1 for solid, 2 for gradient)
     */

    if ('display_name_styles' in data) {
      if (data.display_name_styles) {
        /**
         * The display name style of this user (font, effect, colors)
         * @type {?DisplayNameStyles}
         */
        this.displayNameStyles = {
          fontId:   data.display_name_styles.font_id   ?? data.display_name_styles.fontId   ?? null,
          effectId: data.display_name_styles.effect_id ?? data.display_name_styles.effectId ?? null,
          colors:   data.display_name_styles.colors    ?? [],
        };
      } else {
        this.displayNameStyles = null;
      }
    } else {
      this.displayNameStyles ??= null;
    }

    // ─── Avatar Decoration ──────────────────────────────────────────────────

    /**
     * @typedef {Object} AvatarDecorationData
     * @property {string}    asset The avatar decoration hash
     * @property {Snowflake} skuId The id of the avatar decoration's SKU
     */

    if ('avatar_decoration_data' in data) {
      if (data.avatar_decoration_data) {
        /**
         * The user avatar decoration's data
         * @type {?AvatarDecorationData}
         */
        this.avatarDecorationData = {
          asset: data.avatar_decoration_data.asset,
          skuId: data.avatar_decoration_data.sku_id,
        };
      } else {
        this.avatarDecorationData = null;
      }
    } else {
      this.avatarDecorationData ??= null;
    }

    // ─── Primary Guild / Clan ───────────────────────────────────────────────

    /**
     * @typedef {Object} UserPrimaryGuild
     * @property {?Snowflake} identityGuildId  The id of the user's primary guild
     * @property {?boolean}   identityEnabled  Whether the user is displaying the primary guild's tag
     * @property {?string}    tag              The user's guild tag (max 4 characters)
     * @property {?string}    badge            The guild tag badge hash
     */

    if ('primary_guild' in data) {
      if (data.primary_guild) {
        /**
         * The primary guild of the user
         * @type {?UserPrimaryGuild}
         */
        this.primaryGuild = {
          identityGuildId: data.primary_guild.identity_guild_id,
          identityEnabled: data.primary_guild.identity_enabled,
          tag:             data.primary_guild.tag,
          badge:           data.primary_guild.badge,
        };
      } else {
        this.primaryGuild = null;
      }
    } else {
      this.primaryGuild ??= null;
    }

    // ─── Collectibles ───────────────────────────────────────────────────────

    /**
     * @typedef {Object} NameplatePalette
     * @property {string} [backgroundPrimary]   Primary background color
     * @property {string} [backgroundSecondary] Secondary background color
     * @property {string} [bodyTextNormal]       Normal body text color
     * @property {string} [bodyTextMuted]        Muted body text color
     * @property {string} [bodyTextStrong]       Strong body text color
     */

    /**
     * @typedef {Object} NameplateData
     * @property {Snowflake}        skuId   The id of the nameplate's SKU
     * @property {string}           asset   The nameplate's asset path
     * @property {string}           label   The nameplate's label
     * @property {NameplatePalette} palette Background color palette of the nameplate
     */

    /**
     * @typedef {Object} Collectibles
     * @property {?NameplateData} nameplate The user's nameplate data
     */

    if ('collectibles' in data) {
      if (data.collectibles?.nameplate) {
        /**
         * The user's collectibles
         * @type {?Collectibles}
         */
        this.collectibles = {
          nameplate: {
            skuId:   data.collectibles.nameplate.sku_id,
            asset:   data.collectibles.nameplate.asset,
            label:   data.collectibles.nameplate.label,
            palette: data.collectibles.nameplate.palette,
          },
        };
      } else {
        this.collectibles = data.collectibles ? { nameplate: null } : null;
      }
    } else {
      this.collectibles ??= null;
    }

    // ─── Bio ────────────────────────────────────────────────────────────────

    if ('bio' in data) {
      /**
       * The bio of the user (self-introduction)
       * @type {?string}
       */
      this.bio = data.bio ?? null;
    } else {
      this.bio ??= null;
    }

    // ─── Pronouns ───────────────────────────────────────────────────────────

    if ('pronouns' in data) {
      /**
       * The pronouns of the user
       * @type {?string}
       */
      this.pronouns = data.pronouns ?? null;
    } else {
      this.pronouns ??= null;
    }

    // ─── Premium (Nitro) ────────────────────────────────────────────────────

    /**
     * @typedef {Object} PremiumInfo
     * @property {?number} type  The Nitro subscription type (1 = Classic, 2 = Nitro, 3 = Basic)
     * @property {?Date}   since The date the subscription started
     */

    if ('premium_type' in data) {
      /**
       * The Nitro subscription type of the user
       * 0 = None, 1 = Classic, 2 = Nitro, 3 = Basic
       * @type {?number}
       */
      this.premiumType = data.premium_type ?? null;
    } else {
      this.premiumType ??= null;
    }

    if ('premium_since' in data) {
      /**
       * The date the user's Nitro subscription started
       * @type {?Date}
       */
      this.premiumSince = data.premium_since ? new Date(data.premium_since) : null;
    } else {
      this.premiumSince ??= null;
    }

    if ('premium_guild_since' in data) {
      /**
       * The date the user boosted a guild
       * @type {?Date}
       */
      this.premiumGuildSince = data.premium_guild_since ? new Date(data.premium_guild_since) : null;
    } else {
      this.premiumGuildSince ??= null;
    }

    // ─── Profile Effect ─────────────────────────────────────────────────────

    /**
     * @typedef {Object} ProfileEffect
     * @property {Snowflake} id        The effect's id
     * @property {Snowflake} skuId     The SKU id of the effect
     * @property {?Date}     expiresAt The expiration date of the effect, or null if permanent
     */

    if (data.user_profile?.profile_effect) {
      /**
       * The profile effect of the user
       * @type {?ProfileEffect}
       */
      this.profileEffect = {
        id:        data.user_profile.profile_effect.id,
        skuId:     data.user_profile.profile_effect.sku_id,
        expiresAt: data.user_profile.profile_effect.expires_at
          ? new Date(data.user_profile.profile_effect.expires_at)
          : null,
      };
    } else {
      this.profileEffect ??= null;
    }

    // ─── Theme Colors ────────────────────────────────────────────────────────

    if (data.user_profile && 'theme_colors' in data.user_profile) {
      /**
       * The theme colors used on this user's profile (array of 2 decimal color ints)
       * @type {?number[]}
       */
      this.themeColors = data.user_profile.theme_colors ?? null;
    } else {
      this.themeColors ??= null;
    }

    // ─── Badges ─────────────────────────────────────────────────────────────

    /**
     * @typedef {Object} Badge
     * @property {string}  id          The badge identifier (e.g. `'premium_tenure_1_month_v2'`)
     * @property {string}  description Human-readable description of the badge
     * @property {string}  icon        The badge icon hash
     * @property {?string} link        An optional URL linked to the badge
     */

    if ('badges' in data) {
      /**
       * The profile badges of the user
       * @type {Badge[]}
       */
      this.badges = data.badges ?? [];
    } else {
      this.badges ??= [];
    }

    if ('guild_badges' in data) {
      /**
       * The guild-specific badges of the user
       * @type {Object[]}
       */
      this.guildBadges = data.guild_badges ?? [];
    } else {
      this.guildBadges ??= [];
    }

    // ─── Mutual guilds & friends ─────────────────────────────────────────────

    /**
     * @typedef {Object} MutualGuild
     * @property {Snowflake} id   The guild's id
     * @property {?string}   nick The user's nickname in that guild
     */

    if ('mutual_guilds' in data) {
      /**
       * Mutual guilds shared with the client user (only populated after `getProfile()`)
       * @type {MutualGuild[]}
       */
      this.mutualGuilds = data.mutual_guilds ?? [];
    } else {
      this.mutualGuilds ??= [];
    }

    if ('mutual_friends_count' in data) {
      /**
       * Number of mutual friends with the client user
       * @type {?number}
       */
      this.mutualFriendsCount = data.mutual_friends_count ?? null;
    } else {
      this.mutualFriendsCount ??= null;
    }

    // ─── Connected Accounts ──────────────────────────────────────────────────

    /**
     * @typedef {Object} ConnectedAccount
     * @property {string}  type     The service type (e.g. `'spotify'`, `'github'`)
     * @property {string}  id       The account id on that service
     * @property {string}  name     The account name/username on that service
     * @property {boolean} verified Whether the connection is verified
     */

    if ('connected_accounts' in data) {
      /**
       * The connected accounts of the user (only populated after `getProfile()`)
       * @type {ConnectedAccount[]}
       */
      this.connectedAccounts = data.connected_accounts ?? [];
    } else {
      this.connectedAccounts ??= [];
    }

    // ─── Legacy username ─────────────────────────────────────────────────────

    if ('legacy_username' in data) {
      /**
       * The user's legacy username (before the username migration), if any
       * @type {?string}
       */
      this.legacyUsername = data.legacy_username ?? null;
    } else {
      this.legacyUsername ??= null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Getters
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The primary clan the user is in
   * @type {?UserPrimaryGuild}
   * @deprecated Use `primaryGuild` instead
   */
  get clan() {
    return this.primaryGuild;
  }

  /**
   * The user avatar decoration's hash
   * @type {?string}
   * @deprecated Use `avatarDecorationData` instead
   */
  get avatarDecoration() {
    return this.avatarDecorationData?.asset ?? null;
  }

  /**
   * Whether this User is a partial
   * @type {boolean}
   * @readonly
   */
  get partial() {
    return typeof this.username !== 'string';
  }

  /**
   * The timestamp the user was created at
   * @type {number}
   * @readonly
   */
  get createdTimestamp() {
    return SnowflakeUtil.timestampFrom(this.id);
  }

  /**
   * The time the user was created at
   * @type {Date}
   * @readonly
   */
  get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * The hexadecimal version of the user accent color, with a leading hash
   * @type {?string}
   * @readonly
   */
  get hexAccentColor() {
    if (typeof this.accentColor !== 'number') return this.accentColor;
    return `#${this.accentColor.toString(16).padStart(6, '0')}`;
  }

  /**
   * The tag of this user
   * <info>This user's username, or their legacy tag (e.g. `hydrabolt#0001`)
   * if they're using the legacy username system</info>
   * @type {?string}
   * @readonly
   */
  get tag() {
    return typeof this.username === 'string'
      ? this.discriminator === '0' || this.discriminator === '0000'
        ? this.username
        : `${this.username}#${this.discriminator}`
      : null;
  }

  /**
   * The global name of this user, or their username if they don't have one
   * @type {?string}
   * @readonly
   */
  get displayName() {
    return this.globalName ?? this.username;
  }

  /**
   * Whether the user has an active Nitro subscription
   * @type {boolean}
   * @readonly
   */
  get nitro() {
    return this.premiumType !== null && this.premiumType > 0;
  }

  /**
   * The DM between the client's user and this user
   * @type {?DMChannel}
   * @readonly
   */
  get dmChannel() {
    return this.client.users.dmChannel(this.id);
  }

  /**
   * The note set for this user by the client
   * @type {?string}
   * @readonly
   */
  get note() {
    return this.client.notes.cache.get(this.id) ?? null;
  }

  /**
   * The voice state of this user
   * @type {VoiceState}
   * @readonly
   */
  get voice() {
    return (
      this.client.voiceStates.cache.get(this.id) ??
      this.client.guilds.cache.find(g => g?.voiceStates?.cache?.get(this.id))?.voiceStates?.cache?.get(this.id) ??
      new VoiceState({ client: this.client }, { user_id: this.id })
    );
  }

  /**
   * Check relationship status (Client → User)
   * @type {RelationshipType}
   * @readonly
   */
  get relationship() {
    const i = this.client.relationships.cache.get(this.id) ?? 0;
    return RelationshipTypes[parseInt(i)];
  }

  /**
   * Get friend nickname
   * @type {?string}
   * @readonly
   */
  get friendNickname() {
    return this.client.relationships.friendNicknames.get(this.id) ?? null;
  }

  /**
   * A link to the user's default avatar
   * @type {string}
   * @readonly
   */
  get defaultAvatarURL() {
    const index =
      this.discriminator === '0' || this.discriminator === '0000'
        ? Util.calculateUserDefaultAvatarIndex(this.id)
        : this.discriminator % 5;
    return this.client.rest.cdn.DefaultAvatar(index);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  URL helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * A link to the user's avatar.
   * @param {ImageURLOptions} [options={}] Options for the Image URL
   * @returns {?string}
   */
  avatarURL({ format, size, dynamic } = {}) {
    if (!this.avatar) return null;
    return this.client.rest.cdn.Avatar(this.id, this.avatar, format, size, dynamic);
  }

  /**
   * A link to the user's avatar if they have one, otherwise their default avatar.
   * @param {ImageURLOptions} [options={}] Options for the Image URL
   * @returns {string}
   */
  displayAvatarURL(options) {
    return this.avatarURL(options) ?? this.defaultAvatarURL;
  }

  /**
   * A link to the user's avatar decoration.
   * @returns {?string}
   */
  avatarDecorationURL() {
    if (!this.avatarDecorationData) return null;
    return this.client.rest.cdn.AvatarDecoration(this.avatarDecorationData.asset);
  }

  /**
   * A link to the user's banner.
   * <info>This method will throw an error if called before the user is force fetched.</info>
   * @param {ImageURLOptions} [options={}] Options for the Image URL
   * @returns {?string}
   */
  bannerURL({ format, size, dynamic } = {}) {
    if (typeof this.banner === 'undefined') throw new Error('USER_BANNER_NOT_FETCHED');
    if (!this.banner) return null;
    return this.client.rest.cdn.Banner(this.id, this.banner, format, size, dynamic);
  }

  /**
   * A link to the user's guild tag badge.
   * @returns {?string}
   */
  guildTagBadgeURL() {
    if (!this.primaryGuild?.identityGuildId || !this.primaryGuild?.badge) return null;
    return this.client.rest.cdn.GuildTagBadge(this.primaryGuild.identityGuildId, this.primaryGuild.badge);
  }

  /**
   * @deprecated Use `guildTagBadgeURL()` instead
   */
  clanBadgeURL() {
    return this.guildTagBadgeURL();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Actions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Creates a DM channel between the client and the user.
   * @param {boolean} [force=false] Whether to skip the cache check and request the API
   * @returns {Promise<DMChannel>}
   */
  createDM(force = false) {
    return this.client.users.createDM(this.id, force);
  }

  /**
   * Deletes a DM channel (if one exists) between the client and the user.
   * @returns {Promise<DMChannel>}
   */
  deleteDM() {
    return this.client.users.deleteDM(this.id);
  }

  /**
   * Fetches this user.
   * @param {boolean} [force=true] Whether to skip the cache check and request the API
   * @returns {Promise<User>}
   */
  fetch(force = true) {
    return this.client.users.fetch(this.id, { force });
  }

  /**
   * Returns a user profile object for a given user ID.
   * <info>This endpoint requires one of the following:
   * - The user is a bot
   * - The user shares a mutual guild with the current user
   * - The user is a friend of the current user
   * - The user is a friend suggestion of the current user
   * - The user has an outgoing friend request to the current user</info>
   * @param {Snowflake} [guildId] The guild ID to get the user's member profile in
   * @returns {Promise<Object>}
   * @see {@link https://discord-userdoccers.vercel.app/resources/user#response-body}
   */
  getProfile(guildId) {
    return this.client.api.users(this.id).profile.get({
      query: {
        with_mutual_guilds:        true,
        with_mutual_friends:       true,
        with_mutual_friends_count: true,
        guild_id:                  guildId,
      },
    });
  }

  /**
   * Updates the note of this user.
   * @param {string|null} [note=null] The new note value
   * @returns {Promise<User>}
   */
  async setNote(note = null) {
    await this.client.notes.updateNote(this.id, note);
    return this;
  }

  /**
   * Send a friend request to this user.
   * @returns {Promise<boolean>}
   */
  sendFriendRequest() {
    return this.client.relationships.sendFriendRequest(this);
  }

  /**
   * Unblock / unfriend / cancel a friend request for this user.
   * @returns {Promise<boolean>}
   */
  deleteRelationship() {
    return this.client.relationships.deleteRelationship(this);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Display Name Style
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Font name → ID mapping for display name styles.
   * @type {Object<string, number>}
   * @readonly
   * @static
   */
  static get FONT_MAP() {
    return {
      Sans:      11,
      Tempo:     12,
      Sakura:    3,
      JellyBean: 4,
      Modern:    6,
      Medieval:  7,
      '8Bit':    8,
      Vampire:   10,
    };
  }

  /**
   * Effect name → ID mapping for display name styles.
   * @type {Object<string, number>}
   * @readonly
   * @static
   */
  static get EFFECT_MAP() {
    return {
      Solid:    1,
      Gradient: 2,
      Neon:     3,
      Toon:     4,
      Pop:      5,
    };
  }

  /**
   * Resolves a decimal color integer from a hex string or number.
   * @param {string|number} color Hex string (`'#RRGGBB'` / `'RRGGBB'`) or decimal number
   * @returns {number}
   * @static
   */
  static resolveColor(color) {
    if (typeof color === 'string') {
      return parseInt(color.startsWith('#') ? color.slice(1) : color, 16);
    }
    return color;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Equality / serialisation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Checks if the user is equal to another User instance.
   * @param {User} user User to compare with
   * @returns {boolean}
   */
  equals(user) {
    return (
      user &&
      this.id                                  === user.id &&
      this.username                            === user.username &&
      this.discriminator                       === user.discriminator &&
      this.globalName                          === user.globalName &&
      this.avatar                              === user.avatar &&
      this.flags?.bitfield                     === user.flags?.bitfield &&
      this.banner                              === user.banner &&
      this.accentColor                         === user.accentColor &&
      this.bio                                 === user.bio &&
      this.pronouns                            === user.pronouns &&
      this.premiumType                         === user.premiumType &&
      this.avatarDecorationData?.asset         === user.avatarDecorationData?.asset &&
      this.avatarDecorationData?.skuId         === user.avatarDecorationData?.skuId &&
      this.collectibles?.nameplate?.skuId      === user.collectibles?.nameplate?.skuId &&
      this.collectibles?.nameplate?.asset      === user.collectibles?.nameplate?.asset &&
      this.collectibles?.nameplate?.label      === user.collectibles?.nameplate?.label &&
      this.collectibles?.nameplate?.palette    === user.collectibles?.nameplate?.palette &&
      this.primaryGuild?.identityGuildId       === user.primaryGuild?.identityGuildId &&
      this.primaryGuild?.identityEnabled       === user.primaryGuild?.identityEnabled &&
      this.primaryGuild?.tag                   === user.primaryGuild?.tag &&
      this.primaryGuild?.badge                 === user.primaryGuild?.badge &&
      this.displayNameStyles?.fontId           === user.displayNameStyles?.fontId &&
      this.displayNameStyles?.effectId         === user.displayNameStyles?.effectId &&
      JSON.stringify(this.displayNameStyles?.colors) === JSON.stringify(user.displayNameStyles?.colors) &&
      this.profileEffect?.id                   === user.profileEffect?.id &&
      JSON.stringify(this.themeColors)         === JSON.stringify(user.themeColors)
    );
  }

  /**
   * Compares the user with a raw API user object.
   * @param {APIUser} user The API user object to compare
   * @returns {boolean}
   * @private
   */
  _equals(user) {
    return (
      user &&
      this.id            === user.id &&
      this.username      === user.username &&
      this.discriminator === user.discriminator &&
      this.globalName    === user.global_name &&
      this.avatar        === user.avatar &&
      this.flags?.bitfield === user.public_flags &&
      ('banner'       in user ? this.banner       === user.banner       : true) &&
      ('accent_color' in user ? this.accentColor  === user.accent_color : true) &&
      ('bio'          in user ? this.bio          === user.bio          : true) &&
      ('pronouns'     in user ? this.pronouns     === user.pronouns     : true) &&
      ('premium_type' in user ? this.premiumType  === user.premium_type : true) &&
      ('avatar_decoration_data' in user
        ? this.avatarDecorationData?.asset  === user.avatar_decoration_data?.asset &&
          this.avatarDecorationData?.skuId  === user.avatar_decoration_data?.sku_id
        : true) &&
      ('collectibles' in user
        ? this.collectibles?.nameplate?.skuId   === user.collectibles?.nameplate?.sku_id &&
          this.collectibles?.nameplate?.asset   === user.collectibles?.nameplate?.asset &&
          this.collectibles?.nameplate?.label   === user.collectibles?.nameplate?.label &&
          this.collectibles?.nameplate?.palette === user.collectibles?.nameplate?.palette
        : true) &&
      ('primary_guild' in user
        ? this.primaryGuild?.identityGuildId === user.primary_guild?.identity_guild_id &&
          this.primaryGuild?.identityEnabled === user.primary_guild?.identity_enabled &&
          this.primaryGuild?.tag             === user.primary_guild?.tag &&
          this.primaryGuild?.badge           === user.primary_guild?.badge
        : true) &&
      ('display_name_styles' in user
        ? this.displayNameStyles?.fontId   === (user.display_name_styles?.font_id ?? user.display_name_styles?.fontId) &&
          this.displayNameStyles?.effectId === (user.display_name_styles?.effect_id ?? user.display_name_styles?.effectId) &&
          JSON.stringify(this.displayNameStyles?.colors) === JSON.stringify(user.display_name_styles?.colors)
        : true)
    );
  }

  /**
   * When concatenated with a string, returns the user's mention.
   * @returns {string}
   * @example
   * console.log(`Hello from ${user}!`); // Hello from <@123456789012345678>!
   */
  toString() {
    return `<@${this.id}>`;
  }

  toJSON(...props) {
    const json = super.toJSON(
      {
        createdTimestamp:  true,
        defaultAvatarURL:  true,
        hexAccentColor:    true,
        tag:               true,
        displayName:       true,
        nitro:             true,
      },
      ...props,
    );
    json.avatarURL          = this.avatarURL();
    json.displayAvatarURL   = this.displayAvatarURL();
    json.bannerURL          = this.banner ? this.bannerURL() : this.banner;
    json.guildTagBadgeURL   = this.guildTagBadgeURL();
    json.avatarDecorationURL = this.avatarDecorationURL();
    return json;
  }
}

/**
 * Sends a message to this user.
 * @method send
 * @memberof User
 * @instance
 * @param {string|MessagePayload|MessageOptions} options The options to provide
 * @returns {Promise<Message>}
 * @example
 * user.send('Hello!')
 *   .then(message => console.log(`Sent message: ${message.content} to ${user.tag}`))
 *   .catch(console.error);
 */
TextBasedChannel.applyToClass(User);

module.exports = User;

/**
 * @external APIUser
 * @see {@link https://discord.com/developers/docs/resources/user#user-object}
 */