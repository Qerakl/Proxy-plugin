import { proxyId } from './geo.js';

export async function getState(api) {
  const data = await api.storage.local.get(['proxy', 'enabled', 'proxies', 'history', 'scope', 'sites']);
  let proxies = data.proxies || [];
  if (!proxies.length && data.history?.length) {
    proxies = data.history.map(h => ({
      id: proxyId(h),
      proxy: h,
      geo: h.geo || null,
      pingMs: h.pingMs || null,
      scope: 'all',
      sites: [],
      addedAt: h.savedAt || Date.now(),
      lastUsed: h.savedAt || Date.now(),
    }));
  }
  const activeId = data.enabled && data.proxy ? proxyId(data.proxy) : null;
  return {
    proxy: data.proxy || null,
    enabled: Boolean(data.enabled),
    scope: data.scope || 'all',
    sites: data.sites || [],
    proxies,
    activeId,
  };
}

export async function saveState(api, partial) {
  await api.storage.local.set(partial);
  return getState(api);
}

export function upsertProxy(proxies, proxy, meta = {}) {
  const id = proxyId(proxy);
  const existing = proxies.find(p => p.id === id);
  const entry = {
    id,
    proxy: {
      type: proxy.type || 'http',
      host: proxy.host,
      port: proxy.port,
      username: proxy.username || '',
      password: proxy.password || '',
    },
    scope: meta.scope ?? existing?.scope ?? 'all',
    sites: meta.sites ?? existing?.sites ?? [],
    geo: meta.geo ?? existing?.geo ?? null,
    ip: meta.ip ?? existing?.ip ?? null,
    pingMs: meta.pingMs ?? existing?.pingMs ?? null,
    speedKbps: meta.speedKbps ?? existing?.speedKbps ?? null,
    checkStatus: meta.checkStatus ?? existing?.checkStatus ?? null,
    checkError: meta.checkError ?? existing?.checkError ?? null,
    lastUsed: meta.lastUsed ?? existing?.lastUsed ?? Date.now(),
    addedAt: existing?.addedAt || Date.now(),
  };
  return [entry, ...proxies.filter(p => p.id !== id)].slice(0, 30);
}

export async function readStoredAuth(api) {
  try {
    const data = await api.storage.session.get('proxyAuth');
    return data.proxyAuth || null;
  } catch {
    const data = await api.storage.local.get('_proxyAuth');
    return data._proxyAuth || null;
  }
}

export async function persistAuth(api, auth, setCurrentAuth) {
  setCurrentAuth(auth);
  try {
    if (auth) await api.storage.session.set({ proxyAuth: auth });
    else await api.storage.session.remove('proxyAuth');
  } catch {
    if (auth) await api.storage.local.set({ _proxyAuth: auth });
    else await api.storage.local.remove('_proxyAuth');
  }
}
