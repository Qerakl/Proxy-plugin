import { parseProxy } from './parser.js';
import { proxyId, dedupKey } from './geo.js';
import { getState, saveState, upsertProxy } from './state.js';
import { runProxyTest } from './test-client.js';

export function createMessageHandler(api, { applyProxy, clearProxy }) {
  return async function handleMessage(message) {
    switch (message.action) {
      case 'getState':
        return { ok: true, ...(await getState(api)) };

      case 'parse':
        return { ok: true, proxy: parseProxy(message.input) };

      case 'connect': {
        const proxy = message.proxy || parseProxy(message.input);
        if (!proxy) return { ok: false, error: 'Не удалось распознать прокси' };
        const scope = message.scope || 'all';
        const sites = message.sites || [];
        try {
          await applyProxy(proxy, { scope, sites });
        } catch (err) {
          return { ok: false, error: err.message };
        }
        const state = await getState(api);
        const proxies = upsertProxy(state.proxies, proxy, {
          lastUsed: Date.now(),
          scope,
          sites,
          ...message.meta,
        });
        await saveState(api, { proxy, enabled: true, scope, sites, proxies });
        return { ok: true, proxy, enabled: true, activeId: proxyId(proxy), scope, sites };
      }

      case 'disconnect':
        await clearProxy();
        await saveState(api, { enabled: false, scope: 'all', sites: [] });
        return { ok: true, enabled: false, activeId: null };

      case 'runTest': {
        const proxy = message.proxy;
        if (!proxy) return { ok: false, error: 'Прокси не указан' };

        const state = await getState(api);
        const wasEnabled = state.enabled;
        let tempApplied = false;

        try {
          if (!wasEnabled) {
            await applyProxy(proxy, { scope: 'all' });
            tempApplied = true;
          }
          const result = await runProxyTest();
          return { ok: true, result };
        } catch (err) {
          return { ok: false, error: err.message || 'Не удалось подключиться к прокси' };
        } finally {
          if (tempApplied) await clearProxy();
        }
      }

      case 'applyForTest': {
        const proxy = message.proxy;
        if (!proxy) return { ok: false, error: 'Прокси не указан' };
        await applyProxy(proxy, { scope: 'all' });
        return { ok: true };
      }

      case 'restoreAfterTest': {
        const { enabled, proxy, scope, sites } = await getState(api);
        if (enabled && proxy) {
          await applyProxy(proxy, { scope, sites });
        } else {
          await clearProxy();
        }
        return { ok: true };
      }

      case 'addProxy': {
        const proxy = message.proxy || parseProxy(message.input);
        if (!proxy) return { ok: false, error: 'Не удалось распознать прокси' };
        const scope = message.scope || 'all';
        const sites = message.sites || [];
        const state = await getState(api);
        const proxies = upsertProxy(state.proxies, proxy, { ...message.meta, scope, sites });
        await saveState(api, { proxies });
        return { ok: true, proxies, id: proxyId(proxy) };
      }

      case 'updateProxy': {
        const { id } = message;
        const proxy = message.proxy || parseProxy(message.input);
        if (!id || !proxy) return { ok: false, error: 'Не удалось распознать прокси' };
        const scope = message.scope || 'all';
        const sites = message.sites || [];
        const state = await getState(api);
        const old = state.proxies.find(p => p.id === id);
        if (!old) return { ok: false, error: 'Прокси не найден' };

        const newId = proxyId(proxy);
        const entry = {
          ...old,
          id: newId,
          proxy: {
            type: proxy.type || 'http',
            host: proxy.host,
            port: proxy.port,
            username: proxy.username || '',
            password: proxy.password || '',
          },
          scope,
          sites,
          ...(message.meta || {}),
        };

        let proxies = state.proxies.filter(p => p.id !== id && p.id !== newId);
        proxies = [entry, ...proxies].slice(0, 30);

        const patch = { proxies };
        if (state.activeId === id || state.activeId === newId) {
          patch.proxy = entry.proxy;
          patch.scope = scope;
          patch.sites = sites;
          if (state.enabled) {
            try {
              await applyProxy(entry.proxy, { scope, sites });
            } catch (err) {
              return { ok: false, error: err.message };
            }
          }
        }
        await saveState(api, patch);
        return { ok: true, id: newId, proxies };
      }

      case 'exportProxies': {
        const state = await getState(api);
        return { ok: true, items: state.proxies };
      }

      case 'importProxies': {
        const items = Array.isArray(message.items) ? message.items : [];
        const state = await getState(api);
        let proxies = [...state.proxies];
        let added = 0;

        for (const raw of items) {
          const proxy = raw.proxy || raw;
          if (!proxy?.host || !proxy?.port) continue;
          const key = dedupKey(proxy);
          if (proxies.some(p => dedupKey(p.proxy) === key)) continue;
          proxies = upsertProxy(proxies, proxy, {
            scope: raw.scope || 'all',
            sites: raw.sites || [],
            geo: raw.geo || null,
            ip: raw.ip || null,
            pingMs: raw.pingMs ?? null,
            checkStatus: raw.checkStatus ?? null,
            checkError: raw.checkError ?? null,
          });
          added++;
        }

        await saveState(api, { proxies });
        return { ok: true, proxies, added };
      }

      case 'removeProxy': {
        const state = await getState(api);
        const proxies = state.proxies.filter(p => p.id !== message.id);
        const patch = { proxies };
        if (state.activeId === message.id) {
          await clearProxy();
          patch.enabled = false;
          patch.proxy = null;
          patch.scope = 'all';
          patch.sites = [];
        }
        await saveState(api, patch);
        return { ok: true, proxies };
      }

      case 'updateProxyMeta': {
        const proxy = message.proxy;
        if (!proxy) return { ok: false };
        const state = await getState(api);
        const proxies = upsertProxy(state.proxies, proxy, message.meta || {});
        await saveState(api, { proxies });
        return { ok: true, proxies };
      }

      case 'clearProxies':
        await saveState(api, { proxies: [] });
        return { ok: true, proxies: [] };

      default:
        return { ok: false, error: 'Unknown action' };
    }
  };
}
