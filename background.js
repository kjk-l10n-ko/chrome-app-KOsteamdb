/* KOsteamdb — hanpe.net 페이지 조회 전용.
   hanpe.net은 CORS 헤더가 없어 content script가 직접 fetch할 수 없다(host_permissions로 service worker에서 조회).
   조회 대상은 https://hanpe.net/app/* 로 제한. 파싱은 DOMParser가 있는 content script에서 한다. */
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type !== 'fetchHanpe') return;
  let u;
  try {
    u = new URL(msg.url);
  } catch {
    send(null);
    return;
  }
  if (u.origin !== 'https://hanpe.net' || !u.pathname.startsWith('/app/')) {
    send(null);
    return;
  }
  fetch(u.href)
    .then((r) => (r.ok ? r.text() : null))
    .then(send, () => send(null));
  return true; // 비동기 응답
});
