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
    patch: '.kr-patch-banner',
    patchLabel: '.kr-patch-type-label',
    patchOfficial: '.official-steam, .official-with-user', // 공식 한국어 / 공식(추가정보 존재)
    lastUpdate: '.steamdb_last_update a.date, #appHeaderGridContainer a[href$="/patchnotes/"]',
    patchItem: '.kr-patch-link-item',
    patchLink: '.kr-patch-link-text',
    patchDesc: '.kr-patch-link-description',
  };

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // 큐레이터 링크(…?curator_clanid=) → 그 페이지 평가문의 실제 링크. href당 1회 조회, 실패 시 원래 링크.
  const resolved = new Map();
  function directLink(href) {
    let u;
    try {
      u = new URL(href);
    } catch {
      return href;
    }
    if (u.origin !== location.origin || !u.searchParams.has('curator_clanid')) return href;
    if (!resolved.has(href)) {
      resolved.set(href, null);
      fetch(href, { credentials: 'include' })
        .then((r) => (r.ok ? r.text() : ''))
        .then((html) => {
          const props = new DOMParser().parseFromString(html, 'text/html')
            .querySelector(SEL.curatorReview)?.dataset.props;
          const url = props && P.curatorLink(props);
          if (url) {
            resolved.set(href, url);
            requestAnimationFrame(sync);
          }
        })
        .catch(() => {});
    }
    return resolved.get(href) ?? href;
  }

  function readPatch() {
    const banner = document.querySelector(SEL.patch);
    if (!banner) return null;
    if (banner.querySelector(SEL.patchLabel)?.matches(SEL.patchOfficial)) return { official: true };
    const parts = [];
    for (const item of banner.querySelectorAll(SEL.patchItem)) {
      const a = item.querySelector(SEL.patchLink);
      const descs = [...item.querySelectorAll(SEL.patchDesc)]
        .map((d) => d.textContent)
        .filter(Boolean);
      const names = [...new Set(descs.map((d) => P.extractAuthor(d)).filter(Boolean))];
      const fallback = (a?.textContent || '').replace(/\[[^\]]*\]/g, '').trim() || '링크';
      const text = `한글 패치(${names.length ? names.join(', ') : fallback})`;
      if (a?.href && a.href !== 'about:blank') {
        const link = el('a', null, text);
        link.href = directLink(a.href);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = descs.map((d) => d.replace(/\n/g, ' / ').trim()).join(' / ');
        parts.push(link);
      } else {
        parts.push(el('span', null, text));
      }
    }
    if (parts.length) return { parts };
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
    const box = el('div', 'kr-relay-hltb'); // 이름/값 2열 그리드(hide.css) — 탭 정렬
    for (const { name, value } of parsed) box.append(el('span', null, name), el('span', null, value));
    return { node: box };
  }

  function readPrice() {
    const purchase = document.querySelector(SEL.purchase);
    let current = null;
    let disc = null;
    if (purchase) {
      const fin = purchase.querySelector(SEL.finalPrice);
      if (fin) {
        current = fin.textContent.trim() || null;
        disc = purchase.querySelector(SEL.discPct)?.textContent.trim() || null;
      } else {
        current = purchase.querySelector(SEL.price)?.textContent.trim() || null;
      }
    }
    // 숫자가 없는 가격 문구(무료로 플레이하기/Free to Play)나 0원은 현재가 없음
    const hasPrice = current
      && /\d/.test(current)
      && !/^₩\s*0(?:[.,]0+)?\s*$/.test(current);
    const bs = [...(document.querySelector(SEL.steamdbTop)?.querySelectorAll('b') ?? [])]
      .map((b) => b.textContent);
    const low = P.parseSteamdbTop(bs);
    if (!hasPrice && !low) return null;
    const box = el('div');
    if (hasPrice) box.appendChild(document.createTextNode(current + (disc ? `(${disc})` : '')));
    if (low) {
      const appid = (location.pathname.match(/\/app\/(\d+)/) ?? [])[1];
      if (appid) {
        if (box.childNodes.length) box.appendChild(document.createTextNode(' | '));
        const a = el('a', null, `최저 ${low.price}${low.discount ? `(${low.discount})` : ''}`);
        a.href = `https://steamdb.info/app/${appid}/`;
        box.appendChild(a);
      }
    }
    return box.childNodes.length ? { node: box } : null;
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

  // SteamDB '최근 업데이트' 날짜를 제자리에서 'YYYY년 M월 D일'로. 멱등이라 관찰자 루프 없음.
  function fixDates() {
    for (const a of document.querySelectorAll(SEL.lastUpdate)) {
      const t = a.firstChild;
      if (t?.nodeType !== 3) continue;
      const k = P.koDate(t.textContent);
      if (k !== t.textContent) t.textContent = k;
    }
  }

  function sync() {
    fixDates();
    const glance = document.querySelector(SEL.glance);
    if (!glance) {
      relay?.remove();
      relay = null;
      lastKey = null;
      return;
    }
    const patch = readPatch();
    const hltb = readHltb();
    const price = readPrice();

    const parts = [];
    if (patch?.official) {
      const v = el('div');
      v.appendChild(el('span', 'kr-relay-official', '공식 한글화'));
      parts.push(row('한글 여부:', v));
    } else if (patch?.parts) {
      const v = el('div');
      patch.parts.forEach((n, i) => { if (i) v.appendChild(document.createTextNode(' | ')); v.appendChild(n); });
      parts.push(row('한글 여부:', v));
    } else if (patch?.text) {
      parts.push(row('한글 여부:', el('div', null, patch.text)));
    }
    if (hltb) parts.push(row('플레이타임:', hltb.node));
    if (price) parts.push(row('가격:', price.node));

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
