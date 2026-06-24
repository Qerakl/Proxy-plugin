import { fetchGeoAndIp } from './geo-fetch.js';

const PING_URL = 'https://www.gstatic.com/generate_204';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal, cache: 'no-store' })
    .finally(() => clearTimeout(timer));
}


async function measurePingOnce() {
  const t0 = performance.now();
  const res = await fetchTimeout(PING_URL, 8000);
  if (!res.ok && res.status !== 204) {
    throw new Error('Прокси не отвечает');
  }
  return Math.round(performance.now() - t0);
}

async function measurePing() {
  let lastError;
  for (let i = 0; i < 3; i++) {
    try {
      if (i > 0) await sleep(400);
      return await measurePingOnce();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Прокси не отвечает');
}

export async function runProxyTest() {
  const pingMs = await measurePing();
  const { ip, geo } = await fetchGeoAndIp();
  return {
    ip: ip || '—',
    pingMs,
    speedKbps: 0,
    geo,
    status: 'online',
  };
}
