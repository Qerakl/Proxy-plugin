import { buildPacScript, parseSites } from './lib/pac.js';
import { createMessageHandler } from './lib/handlers.js';
import { getState, readStoredAuth, persistAuth } from './lib/state.js';

const api = chrome;

let currentAuth = null;

function setCurrentAuth(auth) {
  currentAuth = auth;
}

function registerAuthListener() {
  api.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      if (currentAuth && details.isProxy) {
        callback({ authCredentials: currentAuth });
        return;
      }
      callback({});
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
  );
}

registerAuthListener();

readStoredAuth(api).then((auth) => {
  currentAuth = auth;
});

function schemeForType(type) {
  switch (type) {
    case 'socks5': return 'socks5';
    case 'socks4': return 'socks4';
    case 'https': return 'https';
    default: return 'http';
  }
}

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

  let config;

  if (scope === 'sites') {
    config = {
      mode: 'pac_script',
      pacScript: { data: buildPacScript(proxy, siteList) },
    };
  } else {
    config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: schemeForType(proxy.type || 'http'),
          host: proxy.host,
          port: proxy.port,
        },
        bypassList: ['localhost', '127.0.0.1', '<local>'],
      },
    };
  }

  await api.proxy.settings.set({ value: config, scope: 'regular' });
  await sleep(200);
}

async function clearProxy() {
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
