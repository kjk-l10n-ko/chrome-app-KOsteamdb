/* Steam Info Relay
   Steam HLTB / SteamDB / KOSTEAM이 주입한 DOM을 읽어 #glanceMidCtn 끝에
   우리 행('한글 패치:', 'HowLongToBeat:', '가격:')으로 다시 그린다.
   원본은 hide.css가 숨긴다. 셀렉터는 SEL 상수 한 곳.
   사양: docs/superpowers/specs/2026-11-05-steam-info-relay-design.md */
(() => {
  const P = globalThis.RelayParse;
  if (!P) return;
  const SEL = {
    glance: '#glanceMidCtn',
    hltbText: '#hltb-glance > div:not(.subtitle):not(.column)',
    steamdbTop: '.steamdb_prices_top',
    purchase: '#game_area_purchase .game_area_purchase_game',
    finalPrice: '.discount_final_price',
    discPct: '.discount_pct',
    price: '.game_purchase_price',
    patch: '.kr-patch-banner',
    patchLabel: '.kr-patch-type-label',
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

  function readPatch() {
    const banner = document.querySelector(SEL.patch);
    if (!banner) return null;
    const parts = [];
    for (const item of banner.querySelectorAll(SEL.patchItem)) {
      const a = item.querySelector(SEL.patchLink);
      const descs = [...item.querySelectorAll(SEL.patchDesc)]
        .map((d) => d.textContent)
        .filter(Boolean);
      const names = [...new Set(descs.map((d) => P.extractAuthor(d)).filter(Boolean))];
      const fallback = (a?.textContent || '').replace(/\[[^\]]*\]/g, '').trim() || '링크';
      const text = names.length ? names.join(', ') : fallback;
      if (a?.href && a.href !== 'about:blank') {
        const link = el('a', null, text);
        link.href = a.href;
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
    const parsed = P.parseHltbLines(val.innerText || val.textContent || '');
    if (!parsed) return null;
    const box = el('div');
    const put = (v) => {
      if (!v) return;
      if (box.childNodes.length) box.appendChild(el('br'));
      box.appendChild(document.createTextNode(v));
    };
    put(parsed.main);
    put(parsed.sides);
    put(parsed.completionist);
    return box.childNodes.length ? { node: box } : null;
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

  function sync() {
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
    if (patch?.parts) {
      const v = el('div');
      patch.parts.forEach((n, i) => { if (i) v.appendChild(document.createTextNode(' | ')); v.appendChild(n); });
      parts.push(row('한글 패치:', v));
    } else if (patch?.text) {
      parts.push(row('한글 패치:', el('div', null, patch.text)));
    }
    if (hltb) parts.push(row('HowLongToBeat:', hltb.node));
    if (price) parts.push(row('가격:', price.node));

    const key = parts.map((r) => serialize([...r.lastChild.childNodes])).join('\u0000');
    if (!parts.length) {
      relay?.remove();
      relay = null;
      lastKey = null;
      return;
    }
    if (key === lastKey) {
      if (relay && relay.parentElement !== glance) glance.appendChild(relay);
      return;
    }
    lastKey = key;
    relay ??= el('div', null);
    relay.id = 'kr-relay';
    relay.style.display = 'contents';
    relay.replaceChildren(...parts);
    glance.appendChild(relay);
  }

  new MutationObserver(() => requestAnimationFrame(sync))
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  sync();
})();
