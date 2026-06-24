export function parseSites(input) {
  if (!input || typeof input !== 'string') return [];
  return [...new Set(
    input
      .split(/[\n,;|]+/)
      .map(s => s.trim().toLowerCase())
      .map(s => s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, ''))
      .filter(s => /^[a-z0-9.*-]+$/i.test(s))
  )];
}

function proxyDirective(proxy) {
  const type = proxy.type || 'http';
  const addr = `${proxy.host}:${proxy.port}`;
  if (type === 'socks5') return `SOCKS5 ${addr}`;
  if (type === 'socks4') return `SOCKS ${addr}`;
  if (type === 'https') return `HTTPS ${addr}`;
  return `PROXY ${addr}`;
}

export function buildPacScript(proxy, sites) {
  const list = Array.isArray(sites) ? sites : parseSites(sites);
  if (!list.length) return null;

  const conditions = list.map(site => {
    const host = site.replace(/^\*\./, '');
    return `(dnsDomainIs(host, ".${host}") || host === "${host}" || shExpMatch(host, "*.${host}"))`;
  });

  return `function FindProxyForURL(url, host) {
  host = host.toLowerCase();
  if (${conditions.join(' || ')}) {
    return "${proxyDirective(proxy)}";
  }
  return "DIRECT";
}`;
}

export function scopeLabel(scope, sites = []) {
  if (scope === 'sites' && sites.length) {
    return sites.length === 1 ? '1 сайт' : `${sites.length} сайтов`;
  }
  return 'весь браузер';
}

export function scopeDescription(scope, sites = []) {
  if (scope === 'sites' && sites.length) {
    const n = sites.length;
    if (n === 1) return 'только для 1 сайта';
    return `только для ${n} сайтов`;
  }
  return 'для всего браузера';
}
