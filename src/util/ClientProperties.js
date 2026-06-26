'use strict';

const { randomUUID } = require('node:crypto');
const { request } = require('undici');
const { UserAgent } = require('./Constants');

const FALLBACK_WS_PROPERTIES = {
  client_version: '1.0.9215',
  client_build_number: 521_835,
  native_build_number: 72_186,
  browser_version: '146.0.0.0',
};

const RELEASE_CHANNEL_HOSTS = {
  stable: 'discord.com',
  ptb: 'ptb.discord.com',
  canary: 'canary.discord.com',
  development: 'canary.discord.com',
};

let cachedProperties = null;
let fetchPromise = null;

function getReleaseHost(releaseChannel = 'stable') {
  return RELEASE_CHANNEL_HOSTS[releaseChannel] ?? RELEASE_CHANNEL_HOSTS.stable;
}

function patchDesktopUserAgent(userAgent, clientVersion) {
  return userAgent.replace(/discord\/[\d.]+/i, `discord/${clientVersion}`);
}

function hostVersionToClientVersion(hostVersion) {
  if (!Array.isArray(hostVersion) || hostVersion.length < 3) return null;
  return `${hostVersion[0]}.${hostVersion[1]}.${hostVersion[2]}`;
}

async function fetchClientBuildNumber(releaseChannel = 'stable') {
  const host = getReleaseHost(releaseChannel);
  const response = await request(`https://${host}/app`, {
    headers: { 'User-Agent': UserAgent },
  });
  const html = await response.body.text();
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
  const prioritizedScripts = [
    ...scripts.filter(script => script.includes('/assets/web.')),
    ...scripts.slice().reverse(),
  ];

  for (const script of prioritizedScripts) {
    const assetResponse = await request(`https://${host}${script}`, {
      headers: { 'User-Agent': UserAgent },
    });
    const source = await assetResponse.body.text();
    const match = source.match(/Build Number: (\d+)/);
    if (match) return Number(match[1]);
  }

  throw new Error('CLIENT_BUILD_NUMBER_NOT_FOUND');
}

async function fetchDesktopManifest(releaseChannel = 'stable') {
  const installId = randomUUID();
  const response = await request(
    `https://updates.discord.com/distributions/app/manifests/latest?channel=${releaseChannel}&platform=win&arch=x64&install_id=${installId}`,
    {
      headers: {
        'User-Agent': `Discord/${FALLBACK_WS_PROPERTIES.client_version}`,
      },
    },
  );

  const manifest = JSON.parse(await response.body.text());
  const clientVersion = hostVersionToClientVersion(manifest.full?.host_version);

  if (!clientVersion) throw new Error('CLIENT_VERSION_NOT_FOUND');

  return {
    client_version: clientVersion,
    native_build_number:
      typeof manifest.metadata_version === 'number' ? manifest.metadata_version : null,
  };
}

async function fetchLatest(releaseChannel = 'stable') {
  const [clientBuildNumber, desktopManifest] = await Promise.all([
    fetchClientBuildNumber(releaseChannel),
    fetchDesktopManifest(releaseChannel),
  ]);

  return {
    client_build_number: clientBuildNumber,
    client_version: desktopManifest.client_version,
    native_build_number: desktopManifest.native_build_number,
    browser_user_agent: patchDesktopUserAgent(UserAgent, desktopManifest.client_version),
  };
}

function applyCached(properties, releaseChannel = properties.release_channel ?? 'stable') {
  const latest = cachedProperties ?? FALLBACK_WS_PROPERTIES;

  properties.client_build_number = latest.client_build_number ?? FALLBACK_WS_PROPERTIES.client_build_number;
  properties.client_version = latest.client_version ?? FALLBACK_WS_PROPERTIES.client_version;
  properties.native_build_number = latest.native_build_number ?? FALLBACK_WS_PROPERTIES.native_build_number;

  if (latest.browser_user_agent) {
    properties.browser_user_agent = latest.browser_user_agent;
    const browserVersion = latest.browser_user_agent.match(/Chrome\/([\d.]+)/)?.[1];
    if (browserVersion) properties.browser_version = browserVersion;
  }
}

function createRuntimeProperties(baseProperties = {}) {
  const properties = {
    ...baseProperties,
    client_launch_id: randomUUID(),
    launch_signature: randomUUID(),
    client_heartbeat_session_id: randomUUID(),
  };

  applyCached(properties, properties.release_channel);
  return properties;
}

function ensureFetched(releaseChannel = 'stable') {
  fetchPromise ??= fetchLatest(releaseChannel)
    .then(properties => {
      cachedProperties = properties;
      return properties;
    })
    .catch(() => null);

  return fetchPromise;
}

async function awaitLatest(releaseChannel = 'stable') {
  if (cachedProperties) return cachedProperties;

  await ensureFetched(releaseChannel);
  if (cachedProperties) return cachedProperties;

  try {
    const properties = await fetchLatest(releaseChannel);
    cachedProperties = properties;
    return properties;
  } catch {
    return null;
  }
}

function applyToClientOptions(options) {
  const releaseChannel = options.ws?.properties?.release_channel ?? 'stable';

  if (options.ws?.properties) {
    applyCached(options.ws.properties, releaseChannel);

    options.ws.properties.client_launch_id = randomUUID();
    options.ws.properties.launch_signature = randomUUID();
    options.ws.properties.client_heartbeat_session_id = randomUUID();
  }

  const clientVersion = options.ws?.properties?.client_version ?? FALLBACK_WS_PROPERTIES.client_version;
  const browserUserAgent = options.ws?.properties?.browser_user_agent ?? patchDesktopUserAgent(UserAgent, clientVersion);

  if (options.http?.headers) {
    options.http.headers['User-Agent'] = browserUserAgent;
  }
}

module.exports = {
  FALLBACK_WS_PROPERTIES,
  applyCached,
  applyToClientOptions,
  awaitLatest,
  createRuntimeProperties,
  ensureFetched,
  fetchLatest,
};
