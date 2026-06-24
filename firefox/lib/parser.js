/**
 * Universal proxy string parser.
 * Accepts virtually any common format from clipboard or manual input.
 */

const PROXY_TYPES = ['http', 'https', 'socks5', 'socks4'];

/** Strip BOM, zero-width chars, extra whitespace; use first non-empty line. */
export function cleanInput(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/^[\uFEFF\u200B-\u200D\u2060]+/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function normalizeType(raw) {
  if (!raw) return 'http';
  const t = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (t === 'socks' || t === 'socks5') return 'socks5';
  if (t === 'socks4') return 'socks4';
  if (t === 'https' || t === 'ssl') return 'https';
  return 'http';
}

function isValidHost(host) {
  if (!host || typeof host !== 'string') return false;
  const h = host.trim();
  if (!h) return false;
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  // IPv6 (simplified)
  if (/^[a-fA-F0-9:]+$/.test(h) && h.includes(':')) return true;
  // Domain
  if (/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(h)) return true;
  return false;
}

function buildResult(type, host, port, username, password) {
  const p = parseInt(port, 10);
  if (!isValidHost(host) || !p || p < 1 || p > 65535) return null;
  return {
    type: normalizeType(type),
    host: host.trim(),
    port: p,
    username: username ? String(username).trim() : '',
    password: password ? String(password).trim() : '',
  };
}

function parseJson(input) {
  try {
    const obj = JSON.parse(input);
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const r = parseJson(JSON.stringify(item));
        if (r) return r;
      }
      return null;
    }
    const host = obj.host || obj.ip || obj.server || obj.address || obj.hostname;
    const port = obj.port || obj.proxy_port;
    const type = obj.type || obj.protocol || obj.scheme || obj.proxy_type;
    const username = obj.username || obj.user || obj.login || obj.auth?.username || '';
    const password = obj.password || obj.pass || obj.auth?.password || '';
    return buildResult(type, host, port, username, password);
  } catch {
    return null;
  }
}

function parseUrl(input) {
  try {
    let str = input.trim();
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(str)) {
      str = 'http://' + str;
    }
    const url = new URL(str);
    const type = normalizeType(url.protocol.replace(':', ''));
    const host = url.hostname;
    const port = url.port || (type === 'https' ? 443 : type === 'http' ? 80 : 1080);
    const username = decodeURIComponent(url.username || '');
    const password = decodeURIComponent(url.password || '');
    return buildResult(type, host, port, username, password);
  } catch {
    return null;
  }
}

function parseColonFormat(input) {
  const str = input.trim();

  // type://user:pass@host:port
  const atMatch = str.match(/^(?:(https?|socks[45]?):\/\/)?(?:([^:@]+):([^@]+)@)?([^:@\s]+):(\d+)\s*$/i);
  if (atMatch) {
    const [, type, user, pass, host, port] = atMatch;
    return buildResult(type, host, port, user, pass);
  }

  // host:port:user:pass
  const fourPart = str.match(/^([^:\s]+):(\d+):([^:\s]+):(.+)$/);
  if (fourPart) {
    const [, host, port, user, pass] = fourPart;
    return buildResult('http', host, port, user, pass);
  }

  // user:pass:host:port
  const reverseFour = str.match(/^([^:\s]+):([^:\s]+):([^:\s]+):(\d+)$/);
  if (reverseFour) {
    const [, user, pass, host, port] = reverseFour;
    if (isValidHost(host)) {
      return buildResult('http', host, port, user, pass);
    }
  }

  // host:port
  const twoPart = str.match(/^([^:\s]+):(\d+)\s*$/);
  if (twoPart) {
    const [, host, port] = twoPart;
    return buildResult('http', host, port, '', '');
  }

  // type host port [user pass]
  const spaceParts = str.split(/\s+/);
  if (spaceParts.length >= 2) {
    let type = 'http';
    let offset = 0;
    if (PROXY_TYPES.some(t => spaceParts[0].toLowerCase().includes(t))) {
      type = normalizeType(spaceParts[0]);
      offset = 1;
    }
    const host = spaceParts[offset];
    const port = spaceParts[offset + 1];
    const user = spaceParts[offset + 2] || '';
    const pass = spaceParts[offset + 3] || '';
    return buildResult(type, host, port, user, pass);
  }

  return null;
}

function parseKeyValue(input) {
  const lines = input.split(/[\n;,|]+/).map(s => s.trim()).filter(Boolean);
  const map = {};
  for (const line of lines) {
    const m = line.match(/^([^=:]+)[=:]\s*(.+)$/);
    if (m) {
      map[m[1].toLowerCase().trim()] = m[2].trim();
    }
  }
  if (Object.keys(map).length < 2) return null;
  const host = map.host || map.ip || map.server || map.address;
  const port = map.port;
  const type = map.type || map.protocol || map.scheme || 'http';
  const username = map.username || map.user || map.login || '';
  const password = map.password || map.pass || '';
  return buildResult(type, host, port, username, password);
}

export function parseProxy(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = cleanInput(input);
  if (!trimmed) return null;

  // Try JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const r = parseJson(trimmed);
    if (r) return r;
  }

  // URL format
  if (trimmed.includes('://') || trimmed.includes('@')) {
    const r = parseUrl(trimmed);
    if (r) return r;
  }

  // Key=value multiline
  if (trimmed.includes('=') || (trimmed.includes(':') && trimmed.split('\n').length > 1)) {
    const r = parseKeyValue(trimmed);
    if (r) return r;
  }

  // Colon/space formats
  return parseColonFormat(trimmed);
}

export function formatProxy(proxy) {
  if (!proxy) return '';
  const auth = proxy.username
    ? `${proxy.username}${proxy.password ? ':' + proxy.password : ''}@`
    : '';
  return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
}

export function proxyToDisplay(proxy) {
  if (!proxy) return '—';
  const auth = proxy.username ? ` (${proxy.username})` : '';
  return `${proxy.type.toUpperCase()} · ${proxy.host}:${proxy.port}${auth}`;
}
