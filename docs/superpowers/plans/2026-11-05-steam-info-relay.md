# Steam Info Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `store.steampowered.com/app/*`에서 Steam HLTB·SteamDB·KOSTEAM 확장이 주입한 DOM을 가로채 `#glanceMidCtn`에 한글 패치/HowLongToBeat/가격 행(Steam 기본 형식)으로 재표시하고 원본 블록은 CSS로 숨긴다.

**Architecture:** MV3 확장, 빌드 없음. `content.js`가 `MutationObserver`로 세 확장의 출력을 감시해 파싱(`parse.js` 순수 함수)하고, 결과가 바뀔 때만 `#kr-relay` 컨테이너를 `#glanceMidCtn` 끝에 다시 그린다. 원본 숨김은 `hide.css`.

**Tech Stack:** Vanilla JS (Chrome MV3 content script), CSS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-05-steam-info-relay-design.md` — 셀렉터·라벨·로직은 이 사양 기준, 모호하면 사양이 우선.

## Global Constraints

- `matches: https://store.steampowered.com/app/*`, `run_at: document_idle`, `permissions` 없음.
- 행 DOM은 `createElement`/`textContent`만 사용 — `innerHTML`/`insertAdjacentHTML` 금지(XSS 경계).
- 셀렉터는 `content.js` 상단 `SEL` 상수 한 곳에만.
- `#kr-relay` 컨테이너는 `.dev_row` 클래스를 갖지 않는다(HLTB 앵커 `.dev_row:last-child` 보호). 행 자체는 `dev_row` 사용.
- content script는 ES 모듈이 아니다: `parse.js`는 test 환경에서 `module.exports`, content script 환경에서 `globalThis.RelayParse`로 노출(`export` 키워드 사용 금지).
- 테스트: `node --test parse.test.mjs`.

---

### Task 1: parse.js 순수 함수 + 테스트

**Files:**
- Create: `parse.js`, `parse.test.mjs`

**Interfaces:**
- Produces: `extractAuthor(desc: string): string | null`, `translateHltb(line: string): string`, `parseHltbLines(raw: string): { main: string|null, sides: string|null, completionist: string|null } | null`, `parseSteamdbTop(bTexts: string[]): { price: string, discount: string|null } | null`. Node에서 `module.exports`, 브라우저에서 `globalThis.RelayParse`로 접근.
- Consumes: 없음.

- [ ] **Step 1: 실패하는 테스트 작성**

`parse.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import p from './parse.js';
const { extractAuthor, translateHltb, parseHltbLines, parseSteamdbTop } = p.default ?? p;

test('extractAuthor: 님-패턴', () => {
  assert.equal(extractAuthor('Zvezda님 제작'), 'Zvezda');
  assert.equal(extractAuthor('유저 한국어 패치 - QR 님'), 'QR');
  assert.equal(extractAuthor('suny4629 님 제작 개인 검수판'), 'suny4629');
});
test('extractAuthor: 제작자/제작팀 콜론-패턴', () => {
  assert.equal(extractAuthor('제작자 : 막셋'), '막셋');
  assert.equal(extractAuthor('제작팀 : Team WASD'), 'Team WASD');
  assert.equal(extractAuthor('제작자 : 정보없음'), null);
});
test('extractAuthor: 패치-대시-패턴', () => {
  assert.equal(extractAuthor('유저 한글 패치 - 한무테'), '한무테');
  assert.equal(extractAuthor('유저 한국어 패치 -'), null);
});
test('extractAuthor: 제작자 없는 문구 → null', () => {
  assert.equal(extractAuthor(''), null);
  assert.equal(extractAuthor('백업용'), null);
  assert.equal(extractAuthor('스토브 인디 한국어화'), null);
  assert.equal(extractAuthor('실제로는 한글 지원'), null);
});
test('translateHltb: 접두어/단위', () => {
  assert.equal(translateHltb('Main Story: 25½ Hours'), '메인 스토리: 25½시간');
  assert.equal(translateHltb('Main + Sides: 30 Minutes'), '메인+서브: 30분');
  assert.equal(translateHltb('Completionist: 1 Hour'), '완전 정복: 1시간');
  assert.equal(translateHltb('Main Story: —'), '메인 스토리: —');
});
test('translateHltb: 알 수 없는 접두어 원문 유지', () => {
  assert.equal(translateHltb('Coop: 12 Hours'), 'Coop: 12시간');
});
test('parseSteamdbTop', () => {
  assert.deepEqual(parseSteamdbTop(['₩ 11,000', '-75%']), { price: '₩ 11,000', discount: '-75%' });
  // 2년-최저가 변형: b[1]은 가격(퍼센트 아님)
  assert.deepEqual(parseSteamdbTop(['₩ 11,000', '₩ 22,000']), { price: '₩ 11,000', discount: null });
  assert.equal(parseSteamdbTop(['…']), null);
  assert.equal(parseSteamdbTop([]), null);
});
test('parseHltbLines', () => {
  const raw = 'Main Story: 25½ Hours\nMain + Sides: 40 Hours\nCompletionist: 80 Hours';
  assert.deepEqual(parseHltbLines(raw), {
    main: '메인 스토리: 25½시간', sides: '메인+서브: 40시간', completionist: '완전 정복: 80시간',
  });
  assert.equal(parseHltbLines(''), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test parse.test.mjs`
Expected: FAIL(`Cannot find module './parse.js'`).

- [ ] **Step 3: `parse.js` 최종 구현**

```js
/* Steam Info Relay — 순수 파서. DOM 비의존.
   사양: docs/superpowers/specs/2026-11-05-steam-info-relay-design.md */

const extractAuthor = (desc) => {
  if (typeof desc !== 'string') return null;
  const s = desc.trim();
  let m = s.match(/([^\s:\-|/,()\[\]]+)\s*님/);
  if (m) return m[1];
  m = s.match(/제작(?:자|팀)\s*[:：]\s*([^\n]+)/);
  if (m && !m[1].includes('정보없음')) return m[1].trim();
  m = s.match(/패치\s*-\s*(\S+)/);
  return m ? m[1] : null;
};

const HLTB_PREFIX = [
  [/^Main Story/, '메인 스토리'],
  [/^Main \+ Sides/, '메인+서브'],
  [/^Completionist/, '완전 정복'],
];

const translateHltb = (line) => {
  const unit = line.replace(/Hours?/, '시간').replace(/Minutes?/, '분');
  const p = HLTB_PREFIX.find(([re]) => re.test(unit));
  return p ? unit.replace(p[0], p[1]) : unit;
};

const parseHltbLines = (raw) => {
  if (typeof raw !== 'string') return null;
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return null;
  const out = { main: null, sides: null, completionist: null };
  for (const l of lines) {
    if (l.startsWith('Main Story')) out.main = translateHltb(l);
    else if (l.startsWith('Main + Sides')) out.sides = translateHltb(l);
    else if (l.startsWith('Completionist')) out.completionist = translateHltb(l);
  }
  return Object.values(out).some((v) => v) ? out : null;
};

const parseSteamdbTop = (bTexts) => {
  if (!Array.isArray(bTexts)) return null;
  const price = (bTexts[0] ?? '').trim();
  if (!price || price === '…') return null;
  const d = (bTexts[1] ?? '').trim();
  const discount = /^-\d+%$/.test(d) ? d : null;
  return { price, discount };
};

const exports = { extractAuthor, translateHltb, parseHltbLines, parseSteamdbTop };
if (typeof module !== 'undefined' && module.exports) module.exports = exports;
else globalThis.RelayParse = exports;
```

- [ ] **Step 4: 테스트 통과**

Run: `node --test parse.test.mjs`
Expected: PASS(9 tests).

- [ ] **Step 5: Commit**

```bash
git add parse.js parse.test.mjs && git commit -m "feat: pure parsers for relay rows"
```

### Task 2: manifest, hide.css, content.js

**Files:**
- Create: `manifest.json`, `hide.css`, `content.js`

**Interfaces:**
- Consumes: Task 1의 `globalThis.RelayParse` 4 함수.
- Produces: 로드 가능한 확장 전체.

- [ ] **Step 1: manifest.json 작성**

```json
{
  "manifest_version": 3,
  "name": "Steam Info Relay",
  "version": "0.1.0",
  "description": "Re-renders Steam HLTB / SteamDB lowest price / KOSTEAM patch info as glance rows.",
  "content_scripts": [
    {
      "matches": ["https://store.steampowered.com/app/*"],
      "js": ["parse.js", "content.js"],
      "css": ["hide.css"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: hide.css 작성**

```css
#hltb-glance, .steamdb_prices, .kr-patch-banner { display: none !important; }
#kr-relay > .dev_row { margin-top: 10px; }
#kr-relay a { color: #8f98a0; }
#kr-relay a:hover { color: #dcdedf; }
```

- [ ] **Step 3: content.js 작성 (최종)**

```js
/* Steam Info Relay
   Steam HLTB / SteamDB / KOSTEAM이 주입한 DOM을 읽어 #glanceMidCtn 끝에
   우리 행('한글 패치:', 'HowLongToBeat:', '가격:')으로 다시 그린다.
   원본은 hide.css가 숨긴다. 셀렉터는 SEL 상수 한 곳.
   사양: docs/superpowers/specs/2026-11-05-steam-info-relay-design.md */
(() => {
  const P = globalThis.RelayParse;
  const SEL = {
    glance: '#glanceMidCtn',
    hltb: '#hltb-glance',
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

  /* --- 소스 읽기. null = 그 행 생략 --- */

  // 한글 패치: 링크 있음 → parts(혼합 텍스트/링크), 링크 없음 → text(라벨), 배너 없음 → null
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
    if (!current || /^₩\s*0(?:[.,]0+)?\s*$/.test(current)) return null; // 무료/없음 → 행 생략
    const box = el('div');
    box.appendChild(document.createTextNode(current + (disc ? `(${disc})` : '')));
    const bs = [...(document.querySelector(SEL.steamdbTop)?.querySelectorAll('b') ?? [])]
      .map((b) => b.textContent);
    const low = P.parseSteamdbTop(bs);
    if (low) {
      const appid = (location.pathname.match(/\/app\/(\d+)/) ?? [])[1];
      if (appid) {
        box.appendChild(document.createTextNode(' | '));
        const a = el('a', null, `최저 ${low.price}${low.discount ? `(${low.discount})` : ''}`);
        a.href = `https://steamdb.info/app/${appid}/`;
        box.appendChild(a);
      }
    }
    return box.childNodes.length ? { node: box } : null;
  }

  /* --- 렌더 --- */

  const row = (label, node) => {
    const r = el('div', 'dev_row');
    r.appendChild(el('div', 'subtitle column', label));
    r.appendChild(node);
    return r;
  };

  // 변경 감지용 직렬화 (텍스트 + href + title)
  const serialize = (nodes) => nodes.map((n) =>
    n.nodeType === 1
      ? `a:${n.textContent}:${n.href}:${n.title}`
      : `t:${n.textContent}`
  ).join('\u0001');

  let relay = null;
  let lastKey = null;

  function sync() {
    const glance = document.querySelector(SEL.glance);
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
    relay ??= el('div', null); // id/스타일
    relay.id = 'kr-relay';
    relay.style.display = 'contents';
    relay.replaceChildren(...parts);
    glance.appendChild(relay);
  }

  new MutationObserver(() => requestAnimationFrame(sync))
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  sync();
})();
```

주석 정리: 20행 내 주석만 남기고, `dispatch`/존재하지 않는 함수 참조 없음. `globalThis.RelayParse`는 `parse.js`가 content script의 `js` 배열에 먼저 로드되므로 항상 존재 — 참조 실패 시 조기 실패가 확장 로드 자체를 방해하지 않도록 `if (!P) return;` 가드를 `sync` 첫 줄 대신 IIFE 첫 줄에 두는 것도 허용(단, `const P = globalThis.RelayParse;`가 `undefined`면 `readPatch` 등에서 throw → 확장 콘솔 에러로 확인 가능).

- [ ] **Step 4: 수동 검증**

Chrome `chrome://extensions` → 개발자 모드 → **세 확장(Steam HLTB, SteamDB, KOSTEAM) 설치된 상태**에서 이 저장소를 압축해제 로드 → 스토어 페이지 하드 리프레시:
- `/app/1250/` (Killing Floor, 유저패치 2소스): `한글 패치: Kiss | Kiss(링크 2)` / `HowLongToBeat: 메인 스토리/메인+서브/완전 정복 3줄` / `가격: 현재가 | 최저 ₩...(링크)` 순서로 표시.
- `/app/1145360/` (공식 한국어 사례): `한글 패치: 공식 한국어(또는 라벨)` 표시.
- 무료 게임 (예: `/app/250820/`): 가격 행 없음.
- DevTools Elements에서 `#hltb-glance`, `.steamdb_prices`, `.kr-patch-banner` 이 `display: none`. SteamDB의 나머지 UI(링크/동접자), KOSTEAM 상단바, HLTB의 `.apphub_OtherSiteInfo` 링크는 정상 표시.
- 연령 확인 페이지 침입 시(나이 필터 게임) 확장 콘솔에 에러 없이 대기(`#glanceMidCtn` 없음 → 조용히 no-op).

- [ ] **Step 5: Commit**

```bash
git add manifest.json hide.css content.js && git commit -m "feat: relay rows on app pages"
```

### Task 3: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: README 작성**

```md
# Steam Info Relay

Chrome MV3 확장. `store.steampowered.com/app/*`에서 아래 세 확장이 주입한 DOM을 가로채어
게임 정보 탭(`#glanceMidCtn`)에 Steam 기본 행 형식으로 다시 표시하고, 원본 블록은 숨긴다.

- **한글 패치:** KOSTEAM 배너 → `이름(링크) | 이름(링크)`. 이름은 `X님` / `제작자 : X` / `패치 - X` 휴리스틱, 실패 시 사이트명. 링크 없는 유형(공식 한국어 등)은 유형 라벨만.
- **HowLongToBeat:** Steam HLTB의 `#hltb-glance` 3줄 → `메인 스토리 / 메인+서브 / 완전 정복`.
- **가격:** 구매 박스 현재가(할인율) + SteamDB 최저가(할인율, SteamDB 앱 페이지 링크). 무료 게임은 생략.

**전제:** 세 확장(Steam HLTB, SteamDB, KOSTEAM)이 설치·활성화되어 있어야 정보가 표시된다.
소스를 읽지 못하면 해당 행만 생략되며, 원본 블록은 여전히 숨겨진다.

설치: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드" → 이 폴더.

테스트: `node --test parse.test.mjs`
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: usage and prerequisites"
```

---

## Self-Review

- **Spec coverage:** 행 3개(Task 2 Step 3 readPatch/readHltb/readPrice), CSS 숨김(Step 2), observer+변경시만 다시 그림(Step 3 sync), glance 끝 배치 + `.dev_row:last-child` 보호(`relay`에 `dev_row` 미부여), 실패 시 행 생략(각 read 함수의 null), 이름 휴리스틱(Task 1), HLTB 번역(Task 1), SteamDB b 파싱(Task 1), 무료 생략(테스트: `/app/250820/`, 코드 `^₩\s*0` 검사) — 모두 매핑됨.
- **Placeholder scan:** "TBD/나중에" 없음. Task 2 Step 3의 코드블록 옆 `description`이라는 단어가 우연히 붙었는데, 의미는 "본문 설명"이므로 오타로 제거.
- **Type consistency:** `extractAuthor/translateHltb/parseHltbLines/parseSteamdbTop` 시그니처 Task 1 ↔ Task 2 사용 일치. `readPatch` 반환 `{ parts } | { text }`, `readHltb/readPrice` 반환 `{ node } | null` — 사용처와 일치.
