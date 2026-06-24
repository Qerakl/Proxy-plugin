import { parseProxy, formatProxy, cleanInput } from '../lib/parser.js';
import { formatGeo } from '../lib/geo.js';
import { parseSites, scopeLabel, scopeDescription } from '../lib/pac.js';
import { humanizeError } from '../lib/errors.js';

const api = typeof browser !== 'undefined' ? browser : chrome;

const $ = (id) => document.getElementById(id);

const els = {
  proxyInput: $('proxyInput'),
  pasteBtn: $('pasteBtn'),
  testBtn: $('testBtn'),
  addBtn: $('addBtn'),
  cancelEditBtn: $('cancelEditBtn'),
  formTitle: $('formTitle'),
  sitesOnlyCheck: $('sitesOnlyCheck'),
  sitesBlock: $('sitesBlock'),
  sitesInput: $('sitesInput'),
  statusPill: $('statusPill'),
  statusLabel: $('statusLabel'),
  stateOff: $('stateOff'),
  stateOn: $('stateOn'),
  stateGeo: $('stateGeo'),
  stateHost: $('stateHost'),
  stateIp: $('stateIp'),
  stateScope: $('stateScope'),
  disconnectBtn: $('disconnectBtn'),
  resultsSection: $('resultsSection'),
  resultIp: $('resultIp'),
  resultPing: $('resultPing'),
  resultGeo: $('resultGeo'),
  resultStatus: $('resultStatus'),
  proxyList: $('proxyList'),
  clearListBtn: $('clearListBtn'),
  importBtn: $('importBtn'),
  exportBtn: $('exportBtn'),
  importFile: $('importFile'),
  confirmModal: $('confirmModal'),
  confirmCancelBtn: $('confirmCancelBtn'),
  confirmOkBtn: $('confirmOkBtn'),
  toast: $('toast'),
};

let state = { enabled: false, proxy: null, proxies: [], activeId: null, scope: 'all', sites: [] };
let editingId = null;
let testing = false;

function send(action, data = {}) {
  return api.runtime.sendMessage({ action, ...data });
}

function openKeepalive() {
  try {
    return api.runtime.connect({ name: 'keepalive' });
  } catch {
    return null;
  }
}

function showToast(msg, type = 'success') {
  els.toast.textContent = msg;
  els.toast.className = `toast ${type}`;
  setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function getInputProxy() {
  const text = cleanInput(els.proxyInput.value);
  return text ? parseProxy(text) : null;
}

function getScopeConfig() {
  const sitesOnly = els.sitesOnlyCheck.checked;
  const scope = sitesOnly ? 'sites' : 'all';
  const sites = sitesOnly ? parseSites(els.sitesInput.value) : [];
  return { scope, sites };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function cardGeo(item) {
  return item.geo ? formatGeo(item.geo) : '🌐 Страна не определена';
}

function cardCheckStatus(item) {
  if (item.checkStatus === 'ok') return { text: 'работает', cls: 'ok' };
  if (item.checkStatus === 'fail') return { text: 'ошибка', cls: 'fail' };
  if (item.pingMs && item.checkStatus !== 'fail') return { text: 'работает', cls: 'ok' };
  return { text: 'не проверен', cls: 'unknown' };
}

async function pasteFromClipboard() {
  els.proxyInput.focus();
  try {
    const text = await navigator.clipboard.readText();
    if (text?.trim()) {
      els.proxyInput.value = text.trim();
      showToast('Вставлено из буфера');
      return;
    }
  } catch { /* fallback */ }
  try {
    if (document.execCommand('paste') && els.proxyInput.value.trim()) {
      showToast('Вставлено из буфера');
      return;
    }
  } catch { /* noop */ }
  showToast('Нажмите Ctrl+V в поле', 'error');
}

function setSitesOnly(enabled) {
  els.sitesOnlyCheck.checked = enabled;
  els.sitesBlock.classList.toggle('hidden', !enabled);
}

function setScopeFromItem(item) {
  const scope = item?.scope || 'all';
  const sites = item?.sites || [];
  setSitesOnly(scope === 'sites');
  els.sitesInput.value = sites.join(', ');
}

function setEditMode(item) {
  if (item) {
    editingId = item.id;
    els.formTitle.textContent = 'Редактирование прокси';
    els.addBtn.textContent = 'Сохранить изменения';
    els.cancelEditBtn.classList.remove('hidden');
    els.proxyInput.value = formatProxy(item.proxy);
    setScopeFromItem(item);
  } else {
    editingId = null;
    els.formTitle.textContent = 'Добавление прокси';
    els.addBtn.textContent = '+ Добавить прокси';
    els.cancelEditBtn.classList.add('hidden');
  }
}

function setBadge(mode, label) {
  els.statusPill.className = `live-badge ${mode}`.trim();
  els.statusLabel.textContent = label;
}

function updateStatePanel() {
  const { enabled, activeId, proxies, scope, sites } = state;
  const active = proxies.find(p => p.id === activeId);

  if (enabled && active) {
    els.stateOff.classList.add('hidden');
    els.stateOn.classList.remove('hidden');
    els.stateGeo.textContent = cardGeo(active);
    els.stateHost.textContent = `${active.proxy.host}:${active.proxy.port}`;
    els.stateIp.textContent = active.ip ? `IP: ${active.ip}` : (active.geo?.ip ? `IP: ${active.geo.ip}` : '');
    els.stateScope.textContent = scopeDescription(scope, sites);
    setBadge('on', 'ВКЛ');
  } else {
    els.stateOff.classList.remove('hidden');
    els.stateOn.classList.add('hidden');
    setBadge(testing ? 'busy' : '', testing ? '...' : 'ВЫКЛ');
  }
}

function fillFormForEdit(item) {
  setEditMode(item);
  els.proxyInput.focus();
}

function exitEditMode() {
  setEditMode(null);
  els.proxyInput.value = '';
  setSitesOnly(false);
  els.sitesInput.value = '';
}

function renderList() {
  const { proxies, activeId } = state;

  if (!proxies.length) {
    els.proxyList.innerHTML = `
      <li class="empty-state">
        Добавьте первый прокси<br>
        Запуск выполняется кнопкой ▶ в списке
      </li>`;
    return;
  }

  els.proxyList.innerHTML = proxies.map(item => {
    const p = item.proxy;
    const isActive = item.id === activeId;
    const type = (p.type || 'http').toUpperCase();
    const ping = item.pingMs ? `${item.pingMs} мс` : null;
    const scopeTag = scopeLabel(item.scope || 'all', item.sites || []);
    const status = cardCheckStatus(item);

    return `
      <li class="proxy-card ${isActive ? 'active' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="card-main">
          <div class="card-geo">${escapeHtml(cardGeo(item))}</div>
          <div class="card-host">${escapeHtml(p.host)}:${p.port}</div>
          <div class="card-meta">
            <span class="tag tag-type">${type}</span>
            <span class="tag scope">${escapeHtml(scopeTag)}</span>
            ${ping ? `<span class="tag ping">${ping}</span>` : ''}
            <span class="tag status-${status.cls}">${status.text}</span>
          </div>
          ${item.checkStatus === 'fail' && item.checkError
            ? `<p class="card-error">${escapeHtml(item.checkError)}</p>`
            : ''}
        </div>
        <div class="card-actions">
          ${isActive
            ? `<button type="button" class="card-btn off" data-action="disconnect" title="Отключить">■</button>`
            : `<button type="button" class="card-btn connect" data-action="connect" title="Подключить">▶</button>`
          }
          <button type="button" class="card-btn test" data-action="test" title="Проверить">◎</button>
          <button type="button" class="card-btn edit" data-action="edit" title="Изменить">✎</button>
          <button type="button" class="card-btn delete" data-action="delete" title="Удалить">✕</button>
        </div>
      </li>
    `;
  }).join('');

  els.proxyList.querySelectorAll('.proxy-card').forEach(card => {
    const id = card.dataset.id;
    const item = proxies.find(p => p.id === id);
    if (!item) return;

    card.querySelector('[data-action="connect"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      connectItem(item);
    });

    card.querySelector('[data-action="disconnect"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      disconnect();
    });

    card.querySelector('[data-action="test"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      testProxy(item.proxy, { item });
    });

    card.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fillFormForEdit(item);
    });

    card.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (editingId === id) exitEditMode();
      await send('removeProxy', { id });
      await refresh();
      showToast('Прокси удалён');
    });
  });
}

function showResults(result, error) {
  els.resultsSection.classList.remove('hidden');
  if (error || !result) {
    els.resultIp.textContent = '—';
    els.resultPing.textContent = '—';
    els.resultGeo.textContent = '—';
    els.resultStatus.textContent = error || 'Ошибка проверки';
    els.resultStatus.className = 'err';
    return;
  }
  els.resultStatus.className = '';
  els.resultIp.textContent = result.ip || '—';
  els.resultPing.textContent = result.pingMs != null ? `${result.pingMs} мс` : '—';
  els.resultGeo.textContent = result.geo ? formatGeo(result.geo) : '🌐 Страна не определена';
  els.resultStatus.textContent = 'Работает';
}

async function refresh() {
  state = await send('getState');
  updateStatePanel();
  renderList();
}

function validateScope() {
  const { scope, sites } = getScopeConfig();
  if (scope === 'sites' && !sites.length) {
    showToast('Укажите хотя бы один сайт', 'error');
    els.sitesInput.focus();
    return false;
  }
  return true;
}

async function connectItem(item) {
  const scope = item.scope || 'all';
  const sites = item.sites || [];
  if (scope === 'sites' && !sites.length) {
    showToast('Укажите хотя бы один сайт', 'error');
    fillFormForEdit(item);
    return;
  }
  try {
    const port = openKeepalive();
    const res = await send('connect', { proxy: item.proxy, scope, sites });
    port?.disconnect();
    if (res.ok) {
      await refresh();
      showToast('Прокси подключён');
    } else {
      showToast(humanizeError(new Error(res.error), item.proxy), 'error');
    }
  } catch (err) {
    showToast(humanizeError(err, item.proxy), 'error');
  }
}

async function disconnect() {
  await send('disconnect');
  await refresh();
  showToast('Прокси отключён');
}

async function saveTestMeta(proxy, result, error, scope, sites) {
  const meta = error
    ? {
        checkStatus: 'fail',
        checkError: 'Ошибка проверки',
        scope,
        sites,
        lastUsed: Date.now(),
      }
    : {
        geo: result.geo,
        ip: result.ip,
        pingMs: result.pingMs,
        speedKbps: result.speedKbps,
        checkStatus: 'ok',
        checkError: null,
        scope,
        sites,
        lastUsed: Date.now(),
      };

  await send('updateProxyMeta', { proxy, meta });
}

async function testProxy(proxy, { item = null, toastOnSuccess = true } = {}) {
  if (!proxy) {
    showToast('Вставьте прокси', 'error');
    return { ok: false };
  }

  testing = true;
  els.testBtn.classList.add('loading');
  els.addBtn.disabled = true;
  updateStatePanel();

  const { scope, sites } = item
    ? { scope: item.scope || 'all', sites: item.sites || [] }
    : getScopeConfig();

  try {
    const port = openKeepalive();
    const res = await send('runTest', { proxy });
    port?.disconnect();
    if (!res.ok) throw new Error(res.error || 'Не удалось подключиться к прокси');

    showResults(res.result);
    await saveTestMeta(proxy, res.result, null, scope, sites);
    await refresh();

    if (toastOnSuccess) showToast('Проверка прошла успешно');
    return { ok: true, result: res.result };
  } catch (err) {
    const msg = humanizeError(err, proxy);
    showResults(null, msg);
    await saveTestMeta(proxy, null, msg, scope, sites);
    await refresh();
    showToast(msg, 'error');
    return { ok: false, error: msg };
  } finally {
    testing = false;
    els.testBtn.classList.remove('loading');
    els.addBtn.disabled = false;
    updateStatePanel();
  }
}

async function addOrSaveProxy() {
  const proxy = getInputProxy();
  if (!proxy) {
    showToast('Вставьте прокси', 'error');
    return;
  }
  if (!validateScope()) return;

  const { scope, sites } = getScopeConfig();

  if (editingId) {
    const res = await send('updateProxy', { id: editingId, proxy, scope, sites });
    if (!res.ok) {
      showToast(humanizeError(new Error(res.error), proxy), 'error');
      return;
    }
    editingId = res.id;
    await refresh();
    exitEditMode();
    showToast('Изменения сохранены');
    return;
  }

  await send('addProxy', { proxy, scope, sites });
  await refresh();

  const testResult = await testProxy(proxy, { toastOnSuccess: false });
  if (testResult.ok) {
    showToast('Прокси добавлен и работает');
  } else {
    showToast('Прокси добавлен, но проверка не прошла', 'error');
  }
}

els.sitesOnlyCheck.addEventListener('change', () => {
  setSitesOnly(els.sitesOnlyCheck.checked);
});

els.pasteBtn.addEventListener('click', pasteFromClipboard);

els.proxyInput.addEventListener('paste', () => {
  setTimeout(() => {
    if (els.proxyInput.value.trim()) showToast('Вставлено из буфера');
  }, 0);
});

els.testBtn.addEventListener('click', () => {
  if (!getInputProxy()) {
    showToast('Вставьте прокси', 'error');
    return;
  }
  if (!validateScope()) return;
  testProxy(getInputProxy());
});

els.addBtn.addEventListener('click', addOrSaveProxy);

els.cancelEditBtn.addEventListener('click', () => {
  exitEditMode();
  showToast('Редактирование отменено');
});

els.disconnectBtn.addEventListener('click', disconnect);

els.clearListBtn.addEventListener('click', () => {
  if (!state.proxies.length) return;
  els.confirmModal.classList.remove('hidden');
});

els.confirmCancelBtn.addEventListener('click', () => {
  els.confirmModal.classList.add('hidden');
});

els.confirmOkBtn.addEventListener('click', async () => {
  els.confirmModal.classList.add('hidden');
  if (state.enabled) await send('disconnect');
  await send('clearProxies');
  exitEditMode();
  await refresh();
  showToast('Список очищен');
});

els.exportBtn.addEventListener('click', async () => {
  const res = await send('exportProxies');
  if (!res.ok || !res.items?.length) {
    showToast('Список пуст', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(res.items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'g-proxy-list.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Список экспортирован');
});

els.importBtn.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : data.items || data.proxies || [];
    if (!items.length) {
      showToast('Файл пуст или неверный формат', 'error');
      return;
    }
    const res = await send('importProxies', { items });
    await refresh();
    showToast(res.added ? `Добавлено: ${res.added}` : 'Новых прокси не найдено');
  } catch {
    showToast('Не удалось прочитать файл', 'error');
  }
});

document.addEventListener('DOMContentLoaded', refresh);
