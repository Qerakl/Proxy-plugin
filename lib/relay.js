const NATIVE_HOST = 'com.qerakl.proxy_relay';
export const DEFAULT_RELAY_PORT = 19876;

export function isChrome() {
  return typeof chrome !== 'undefined' && typeof browser === 'undefined';
}

/** Chrome cannot use SOCKS5 username/password directly — needs local relay. */
export function needsRelay(proxy) {
  return isChrome() && proxy?.type === 'socks5' && Boolean(proxy?.username);
}

function sendNative(message) {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendNativeMessage) {
      reject(new Error('Native messaging недоступен'));
      return;
    }
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

export async function startRelay(proxy) {
  try {
    const response = await sendNative({
      action: 'start',
      listen_port: DEFAULT_RELAY_PORT,
      proxy: {
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password || '',
      },
    });
    if (response?.ok && response.port) {
      return { ok: true, port: response.port, mode: 'native' };
    }
    return { ok: false, error: response?.error || 'Relay не запустился' };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      fallbackPort: DEFAULT_RELAY_PORT,
      mode: 'manual',
    };
  }
}

export async function stopRelay() {
  try {
    await sendNative({ action: 'stop' });
  } catch {
    /* manual relay keeps running */
  }
}

export async function pingRelay() {
  try {
    const response = await sendNative({ action: 'ping' });
    return response?.ok && response.port ? response.port : null;
  } catch {
    return null;
  }
}

export function relayProxy(port) {
  return {
    type: 'http',
    host: '127.0.0.1',
    port,
    username: '',
    password: '',
    _relay: true,
  };
}
