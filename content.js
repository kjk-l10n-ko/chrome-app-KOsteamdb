/* Steam Info Relay
   Steam HLTB / SteamDB / KOSTEAM이 주입한 DOM을 읽어 #glanceMidCtn의 태그 열 앞에
   우리 행('한글 여부:', '플레이타임:', '가격:')으로 다시 그린다.
   원본은 hide.css가 숨긴다. 셀렉터는 SEL 상수 한 곳.
   사양: docs/superpowers/specs/2026-11-05-steam-info-relay-design.md */
(() => {
  const P = globalThis.RelayParse;
  if (!P) return;
  const SEL = {
    glance: '#glanceMidCtn',
    glanceRight: '.glance_ctn_responsive_right',
    curatorReview: '[data-featuretarget="referring-curator-review"]',
    hltbText: '#hltb-glance > div:not(.subtitle):not(.column)',
    steamdbTop: '.steamdb_prices_top',
    purchase: '#game_area_purchase .game_area_purchase_game',
    finalPrice: '.discount_final_price',
    discPct: '.discount_pct',
    price: '.game_purchase_price',
    origPrice: '.discount_original_price',
    patch: '.kr-patch-banner',
    patchLabel: '.kr-patch-type-label',
    patchOfficial: '.official-steam, .official-with-user', // 공식 한국어 / 공식(추가정보 존재)
    releaseRow: '#glanceMidCtn .release_date',
    releaseDate: '#glanceMidCtn .release_date .date',
    updateDate: '.steamdb_last_update a.date',
    updateOld: '.steamdb_last_update_old', // SteamDB가 1년 넘은 '(…전)'에 붙이는 클래스(빨간색)
    leftDevRow: '.glance_ctn_responsive_left .dev_row:not(#kr-date)',
    patchItem: '.kr-patch-link-item',
    patchLink: '.kr-patch-link-text',
    patchDesc: '.kr-patch-link-description',
    hanpeSection: 'section',
    hanpeLink: 'a[href^="/han/"]', // 텍스트가 실제 패치 URL (href는 한패 클릭 카운터)
    hanpeDesc: 'p',
  };

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // 링크 확장: 큐레이터 링크(…?curator_clanid=) → 평가문 속 실제 링크, 한패넷 게임 페이지 → 그 페이지의 패치 링크들.
  // href당 1회 조회. 결과 [{url, desc}], 조회 중/실패는 null(→ 원래 링크 표시). 확정되면 재동기화.
  const resolved = new Map();

  async function fetchCurator(href) {
    const html = await fetch(href, { credentials: 'include' }).then((r) => (r.ok ? r.text() : ''));
    const props = new DOMParser().parseFromString(html, 'text/html').querySelector(SEL.curatorReview)?.dataset.props;
    const url = props && P.curatorLink(props);
    return url ? [{ url, desc: '' }] : null;
  }

  async function fetchHanpe(href) {
    const html = await chrome.runtime.sendMessage({ type: 'fetchHanpe', url: href }); // CORS 때문에 background 경유
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sec = [...doc.querySelectorAll(SEL.hanpeSection)]
      .find((s) => s.querySelector('h2')?.textContent.trim() === '한글패치');
    return [...(sec?.querySelectorAll(SEL.hanpeLink) ?? [])]
      .map((a) => ({
        url: a.textContent.trim(),
        desc: a.parentElement.parentElement.querySelector(SEL.hanpeDesc)?.textContent.trim() ?? '',
      }))
      .filter((x) => P.urlKey(x.url));
  }

  function expand(href) {
    let u;
    try {
      u = new URL(href);
    } catch {
      return null;
    }
    const hanpe = u.origin === 'https://hanpe.net';
    if (!hanpe && !(u.origin === location.origin && u.searchParams.has('curator_clanid'))) return null;
    if (!resolved.has(href)) {
      resolved.set(href, null);
      (hanpe ? fetchHanpe(href) : fetchCurator(href))
        .then((list) => {
          if (list?.length) {
            resolved.set(href, list);
            requestAnimationFrame(sync);
          }
        })
        .catch(() => {});
    }
    return resolved.get(href);
  }

  function readPatch() {
    const banner = document.querySelector(SEL.patch);
    if (!banner) return null;
    const official = !!banner.querySelector(SEL.patchLabel)?.matches(SEL.patchOfficial);
    const entries = new Map(); // 링크 키 → {text, url, title, named}. 같은 링크는 하나만(이름 있는 쪽 우선)
    const add = (url, names, fallback, title) => {
      const named = names.length > 0;
      const entry = { text: `한글 패치 (${named ? names.join(', ') : fallback})`, url, title, named };
      const key = P.urlKey(url) ?? `#${entries.size}`;
      const prev = entries.get(key);
      if (!prev || (!prev.named && named)) entries.set(key, entry);
    };
    for (const item of banner.querySelectorAll(SEL.patchItem)) {
      const a = item.querySelector(SEL.patchLink);
      const descs = [...item.querySelectorAll(SEL.patchDesc)]
        .map((d) => d.textContent)
        .filter(Boolean);
      if (descs.some((d) => d.includes('공식'))) continue; // 설명에 '공식'이 있는 링크는 표시하지 않음
      const names = [...new Set(descs.map((d) => P.extractAuthor(d)).filter(Boolean))];
      const fallback = (a?.textContent || '').replace(/[[\]]/g, '').trim() || '링크';
      const oneLine = (ds) => ds.map((d) => d.replace(/\n/g, ' / ').trim()).join(' / ');
      const list = a?.href ? expand(a.href) : null;
      if (list) {
        for (const { url, desc } of list) {
          if (desc.includes('공식')) continue;
          const own = P.extractAuthor(desc);
          add(url, own ? [own] : names, fallback, oneLine(desc ? [desc] : descs));
        }
      } else {
        add(a?.href ?? '', names, fallback, oneLine(descs));
      }
    }
    const parts = [...entries.values()].map(({ text, url, title, named }) => {
      if (!P.urlKey(url)) return el('span', null, text);
      const link = el('a', null, text);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = title;
      return link;
    });
    if (parts.length || official) return { official, parts };
    const label = banner.querySelector(SEL.patchLabel);
    return label?.textContent.trim() ? { text: label.textContent.trim() } : null;
  }

  function readHltb() {
    const val = document.querySelector(SEL.hltbText);
    if (!val) return null;
    // 원본은 display:none이라 innerText에 <br> 줄바꿈이 없음 → 텍스트 노드를 줄 단위로 읽는다
    const raw = [...val.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('\n');
    const parsed = P.parseHltbLines(raw);
    if (!parsed) return null;
    const box = el('div', 'kr-relay-grid'); // 이름/값 2열 그리드(hide.css) — 탭 정렬
    for (const { name, value } of parsed) box.append(el('span', null, name), el('span', null, value));
    return { node: box };
  }

  // 할인율 괄호는 할인이 있을 때만: 현재가는 .discount_pct, 최저가는 SteamDB 값 없으면(정가 최저/2년 최저 변형)
  // 구매 박스의 정가 대비 계산. 0%(정가)는 표기하지 않는다.
  function readPrice() {
    const purchase = document.querySelector(SEL.purchase);
    let current = null;
    let disc = null;
    let base = null;
    if (purchase) {
      const fin = purchase.querySelector(SEL.finalPrice);
      if (fin) {
        current = fin.textContent.trim() || null;
        disc = purchase.querySelector(SEL.discPct)?.textContent.trim() || null;
        base = purchase.querySelector(SEL.origPrice)?.textContent.trim() || null;
      } else {
        current = purchase.querySelector(SEL.price)?.textContent.trim() || null;
        base = current;
      }
    }
    // 숫자가 없는 가격 문구(무료로 플레이하기/Free to Play)나 0원은 현재가 없음
    const hasPrice = current
      && /\d/.test(current)
      && !/^₩\s*0(?:[.,]0+)?\s*$/.test(current);
    const bs = [...(document.querySelector(SEL.steamdbTop)?.querySelectorAll('b') ?? [])]
      .map((b) => b.textContent);
    const low = P.parseSteamdbTop(bs);
    const appid = (location.pathname.match(/\/app\/(\d+)/) ?? [])[1];
    if (!hasPrice && !(low && appid)) return null;
    const box = el('div');
    if (hasPrice) box.append(disc ? `${current} (${disc})` : current);
    if (low && appid) {
      const pct = low.discount ?? (base ? P.pctOff(low.price, base) : null);
      const a = el('a', null, pct && pct !== '0%' ? `${low.price} (${pct})` : low.price);
      a.href = `https://steamdb.info/app/${appid}/`;
      if (box.childNodes.length) box.append(' | ');
      box.append(a);
    }
    return { node: box };
  }

  const row = (label, node) => {
    const r = el('div', 'dev_row');
    r.appendChild(el('div', 'subtitle column', label));
    node.style.color = '#8f98a0';
    r.appendChild(node);
    return r;
  };

  const serialize = (nodes) => nodes.map((n) =>
    n.nodeType === 1
      ? `a:${n.textContent}:${n.href}:${n.title}`
      : `t:${n.textContent}`
  ).join('\u0001');

  let relay = null;
  let lastKey = null;

  // 출시/업데이트 일자: Steam 출시일 행 바로 앞(같은 위치)에 우리 행을 둔다. 원본(출시일·SteamDB 업데이트)은 hide.css가 숨김.
  // 업데이트 부분은 SteamDB 원본처럼 /patchnotes/ 링크(a.date), 1년 넘은 '(…전)'은 원본 클래스로 SteamDB가 빨갛게 칠함.
  let dateRow = null;
  let dateKey = null;
  function syncDate(glance) {
    const upd = document.querySelector(SEL.updateDate);
    const parts = P.dateParts(document.querySelector(SEL.releaseDate)?.textContent, upd?.textContent);
    const anchor = document.querySelector(SEL.releaseRow) ?? glance.querySelector(SEL.leftDevRow);
    if (!parts || !anchor) {
      dateRow?.remove();
      dateRow = null;
      dateKey = null;
      return;
    }
    const href = upd && P.urlKey(upd.href) ? upd.href : null;
    const old = !!upd?.querySelector(SEL.updateOld);
    const key = JSON.stringify([parts, href, old]);
    if (!dateRow) {
      dateRow = row('출시/업데이트 일자:', el('div'));
      dateRow.id = 'kr-date';
    }
    if (key !== dateKey) {
      dateKey = key;
      const v = dateRow.lastChild;
      v.replaceChildren();
      if (parts.release) v.append(parts.release);
      if (parts.update) {
        const { date, ago } = parts.update;
        const a = el(href ? 'a' : 'span', 'date', ago ? `${date} ` : date);
        if (href) a.href = href;
        if (ago) a.append(el('span', old ? SEL.updateOld.slice(1) : null, `(${ago})`));
        if (parts.release) v.append(' | ');
        v.append(a);
      }
    }
    if (dateRow.nextElementSibling !== anchor) anchor.before(dateRow);
  }

  function sync() {
    const glance = document.querySelector(SEL.glance);
    if (!glance) {
      relay?.remove();
      relay = null;
      lastKey = null;
      dateRow?.remove();
      dateRow = null;
      return;
    }
    syncDate(glance);
    const patch = readPatch();
    const hltb = readHltb();
    const price = readPrice();

    const parts = [];
    if (patch?.parts) {
      const items = patch.official ? [el('span', 'kr-relay-official', '공식 한글화'), ...patch.parts] : patch.parts;
      const v = el('div');
      items.forEach((n, i) => { if (i) v.appendChild(document.createTextNode(' | ')); v.appendChild(n); });
      parts.push(row('한글 여부:', v));
    } else if (patch?.text) {
      parts.push(row('한글 여부:', el('div', null, patch.text)));
    }
    if (hltb) parts.push(row('플레이타임:', hltb.node));
    if (price) parts.push(row('가격(현재/최저):', price.node));

    const key = parts.map((r) => serialize([...r.lastChild.childNodes])).join('\u0000');
    if (!parts.length) {
      relay?.remove();
      relay = null;
      lastKey = null;
      return;
    }
    // 태그 열(.glance_ctn_responsive_right) 바로 앞. 왼쪽 열 안에 넣으면 HLTB 앵커(.dev_row:last-child)가 우리 행을 잡는다.
    const right = glance.querySelector(SEL.glanceRight);
    const before = right?.parentElement === glance ? right : null;
    const place = () => {
      if (relay.parentElement !== glance || relay.nextElementSibling !== before) glance.insertBefore(relay, before);
    };
    if (key === lastKey) {
      if (relay) place();
      return;
    }
    lastKey = key;
    relay ??= el('div', null);
    relay.id = 'kr-relay';
    relay.style.display = 'contents';
    relay.replaceChildren(...parts);
    place();
  }

  new MutationObserver(() => requestAnimationFrame(sync))
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  sync();
})();
