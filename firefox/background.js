import { parseSites } from './lib/pac.js';
import { createMessageHandler } from './lib/handlers.js';
import { getState, readStoredAuth, persistAuth } from './lib/state.js';

const api = browser;

let currentAuth = null;
let proxyHandler = null;

function setCurrentAuth(auth) {
  currentAuth = auth;
}

function proxyAuthHeader(proxy) {
  if (!proxy.username) return null;
  return `Basic ${btoa(`${proxy.username}:${proxy.password || ''}`)}`;
}

function proxyType(type) {
  if (type === 'socks5') return 'socks';
  if (type === 'socks4') return 'socks4';
  if (type === 'https') return 'https';
  return 'http';
}

function removeProxyHandler() {
  if (proxyHandler) {
    try {
      api.proxy.onRequest.removeListener(proxyHandler);
    } catch { /* noop */ }
    proxyHandler = null;
  }
}

function installProxyHandler(proxy, scope, sites) {
  removeProxyHandler();

  const siteList = scope === 'sites'
    ? (Array.isArray(sites) ? sites : parseSites(sites))
    : [];
  const useSites = siteList.length > 0;
  const authHeader = proxyAuthHeader(proxy);
  const type = proxyType(proxy.type || 'http');
  const host = proxy.host;
  const port = Number(proxy.port);

  proxyHandler = (details) => {
    if (useSites) {
      let hostname = '';
      try {
        hostname = new URL(details.url).hostname.toLowerCase();
      } catch {
        return { type: 'direct' };
      }
      const matched = siteList.some(site => {
        const base = site.replace(/^\*\./, '').toLowerCase();
        return hostname === base || hostname.endsWith(`.${base}`);
      });
      if (!matched) return { type: 'direct' };
    }

    const info = { type, host, port };
    if (authHeader) info.proxyAuthorizationHeader = authHeader;
    return info;
  };

  api.proxy.onRequest.addListener(proxyHandler, { urls: ['<all_urls>'] });
}

function registerAuthListener() {
  api.webRequest.onAuthRequired.addListener(
    (details) => {
      const isProxyChallenge = details.isProxy === true
        || details.statusCode === 407
        || (details.statusLine && details.statusLine.includes('407'));

      if (currentAuth && isProxyChallenge) {
        return { authCredentials: currentAuth };
      }
      return {};
    },
    { urls: ['<all_urls>'] },
    ['blocking']
  );
}

registerAuthListener();

readStoredAuth(api).then((auth) => {
  currentAuth = auth;
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function applyProxy(proxy, { scope = 'all', sites = [] } = {}) {
  const auth = proxy.username
    ? { username: proxy.username, password: proxy.password || '' }
    : null;
  await persistAuth(api, auth, setCurrentAuth);

  const siteList = scope === 'sites'
    ? (Array.isArray(sites) ? sites : parseSites(sites))
    : [];

  if (scope === 'sites' && !siteList.length) {
    throw new Error('Укажите хотя бы один сайт');
  }

  installProxyHandler(proxy, scope, siteList);
  await api.proxy.settings.clear({ scope: 'regular' });
  await sleep(400);
}

async function clearProxy() {
  removeProxyHandler();
  await api.proxy.settings.clear({ scope: 'regular' });
  await persistAuth(api, null, setCurrentAuth);
}

async function restoreProxy() {
  const { proxy, enabled, scope, sites } = await getState(api);
  if (enabled && proxy) {
    await applyProxy(proxy, { scope, sites });
  }
}

const handleMessage = createMessageHandler(api, { applyProxy, clearProxy });

api.runtime.onStartup.addListener(restoreProxy);
api.runtime.onInstalled.addListener(restoreProxy);

api.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    port.onMessage.addListener(() => {});
  }
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ ok: false, error: err.message });
  });
  return true;
});

async function updateBadge() {
  const { enabled } = await getState(api);
  await api.action.setBadgeText({ text: enabled ? 'ВКЛ' : '' });
  await api.action.setBadgeBackgroundColor({ color: enabled ? '#22c55e' : '#64748b' });
}

api.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') updateBadge();
});

updateBadge();
