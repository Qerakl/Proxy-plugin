const IPIFY_URL = 'https://api.ipify.org?format=json';

const GEO_PROVIDERS = [
  {
    url: 'https://ipapi.co/json/',
    parse(data) {
      if (!data?.ip) return null;
      const code = (data.country_code || data.country || '').toUpperCase().slice(0, 2);
      return {
        ip: data.ip,
        geo: {
          country: data.country_name || data.country,
          countryCode: code,
          city: data.city || '',
        },
      };
    },
  },
  {
    url: 'https://free.freeipapi.com/api/json/',
    parse(data) {
      if (!data?.ipAddress) return null;
      return {
        ip: data.ipAddress,
        geo: {
          country: data.countryName,
          countryCode: data.countryCode,
          city: data.cityName || '',
        },
      };
    },
  },
  {
    url: 'https://ipwho.is/',
    parse(data) {
      if (data?.success === false || !data?.ip) return null;
      return {
        ip: data.ip,
        geo: {
          country: data.country,
          countryCode: data.country_code,
          city: data.city || '',
        },
      };
    },
  },
  {
    url: 'https://ipinfo.io/json',
    parse(data) {
      if (!data?.ip || !data?.country) return null;
      return {
        ip: data.ip,
        geo: {
          country: data.country,
          countryCode: data.country.toUpperCase(),
          city: data.city || '',
        },
      };
    },
  },
  {
    url: 'https://get.geojs.io/v1/ip/geo.json',
    parse(data) {
      if (!data?.ip || !data?.country_code) return null;
      return {
        ip: data.ip,
        geo: {
          country: data.country,
          countryCode: data.country_code,
          city: data.city || '',
        },
      };
    },
  },
];

function fetchTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal, cache: 'no-store' })
    .finally(() => clearTimeout(timer));
}

function isValidGeoResult(result) {
  return Boolean(result?.ip && result?.geo?.countryCode?.length === 2);
}

async function tryProvider(provider) {
  const res = await fetchTimeout(provider.url, 6000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const result = provider.parse(data);
  if (!isValidGeoResult(result)) throw new Error('invalid geo');
  return result;
}

export async function fetchGeoAndIp() {
  const attempts = GEO_PROVIDERS.map((provider) => tryProvider(provider));

  if (typeof Promise.any === 'function') {
    try {
      return await Promise.any(attempts);
    } catch { /* all failed */ }
  }

  for (const provider of GEO_PROVIDERS) {
    try {
      return await tryProvider(provider);
    } catch { /* next */ }
  }

  try {
    const ipRes = await fetchTimeout(IPIFY_URL, 5000);
    const ipData = await ipRes.json();
    if (ipData.ip) return { ip: ipData.ip, geo: null };
  } catch { /* noop */ }

  return { ip: null, geo: null };
}
