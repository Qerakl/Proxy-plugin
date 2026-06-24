export function humanizeError(err, proxy = null) {
  const msg = (err?.message || String(err || '')).toLowerCase();

  if (err?.name === 'AbortError' || msg.includes('abort')) {
    return 'Прокси не отвечает';
  }
  if (msg.includes('не отвечает') || msg.includes('timeout') || msg.includes('таймаут')) {
    return 'Прокси не отвечает';
  }
  if (msg.includes('401') || msg.includes('407') || msg.includes('auth') || msg.includes('логин') || msg.includes('парол')) {
    return 'Неверный логин или пароль';
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network error')) {
    if (proxy?.username) return 'Неверный логин или пароль';
    return 'Прокси не отвечает';
  }
  if (msg.includes('ip') || msg.includes('определить')) {
    return 'Не удалось определить IP';
  }
  if (msg.includes('сайт')) {
    return 'Укажите хотя бы один сайт';
  }
  if (
    proxy?.type === 'socks5' &&
    proxy?.username &&
    (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch'))
  ) {
    return 'SOCKS5 с логином и паролем может не поддерживаться браузером';
  }
  if (msg.includes('не удалось распознать')) {
    return 'Не удалось распознать прокси';
  }
  if (msg.includes('не удалось подключиться')) {
    return 'Не удалось подключиться к прокси';
  }

  return 'Не удалось подключиться к прокси';
}
