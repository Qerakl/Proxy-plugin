export function countryFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...[...upper].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

let regionNamesRu = null;

function countryLabel(geo) {
  if (!geo) return '';
  const code = (geo.countryCode || '').toUpperCase();
  let name = geo.country || '';

  if (name.length === 2 && code.length === 2) {
    try {
      regionNamesRu ||= new Intl.DisplayNames(['ru'], { type: 'region' });
      name = regionNamesRu.of(code) || code;
    } catch {
      name = code;
    }
  }

  return name;
}

export function formatGeo(geo) {
  if (!geo?.countryCode) return '🌐 Страна не определена';
  const flag = countryFlag(geo.countryCode);
  const country = countryLabel(geo);
  const place = [geo.city, country].filter(Boolean).join(', ');
  return place ? `${flag} ${place}` : `${flag} ${country || geo.countryCode}`;
}

export function dedupKey(proxy) {
  return `${proxy.host}:${proxy.port}:${proxy.username || ''}`;
}

export function proxyId(proxy) {
  return `${proxy.type || 'http'}://${proxy.host}:${proxy.port}`;
}
