/* KOsteamdb — 순수 파서. DOM 비의존.
   사양: docs/superpowers/specs/2026-11-05-steam-info-relay-design.md */

const extractAuthor = (desc) => {
  if (typeof desc !== 'string') return null;
  const s = desc.trim();
  let m = s.match(/([^\s:\-|/,()\[\]]+)\s*님/);
  if (m) return m[1];
  m = s.match(/제작(?:자|팀)\s*[:：]\s*([^\n]+)/);
  if (m && !m[1].includes('정보없음')) return m[1].trim();
  m = s.match(/패치\s*[①-⑳\d]*\s*-\s*([^\s,]+)/);
  return m ? m[1] : null;
};

const HLTB_ITEMS = [['Main Story', '메인'], ['Main + Sides', '메인+서브'], ['Completionist', '완전 정복']];

// '25½ Hours' → '25.5시간', '30 Minutes' → '0.5시간'(소수 첫째 자리, 최소 0.1), 그 외('—')는 그대로
const hltbHours = (text) => {
  const s = text.trim();
  const m = s.match(/^(\d*)(½?)\s*(Hours?|Minutes?)$/);
  if (!m || (!m[1] && !m[2])) return s;
  let h = Number(m[1] || 0) + (m[2] ? 0.5 : 0);
  if (m[3].startsWith('Minute')) h = Math.max(0.1, Math.round(h / 6) / 10);
  return `${h}시간`;
};

const parseHltbLines = (raw) => {
  if (typeof raw !== 'string') return null;
  const lines = raw.split(/\n+/).map((s) => s.trim());
  const out = [];
  for (const [en, ko] of HLTB_ITEMS) {
    const line = lines.find((l) => l.startsWith(`${en}:`));
    if (line) out.push({ name: ko, value: hltbHours(line.slice(en.length + 1)) });
  }
  return out.length ? out : null;
};

// 'YYYY년 M월 D일' 또는 SteamDB ko 'YYYY. M. D.' → 'yy.mm.dd', 날짜가 아니면 null
const shortDate = (text) => {
  const m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/) ?? text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  return m ? `${m[1].slice(2)}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}` : null;
};

// 출시일/업데이트 → {release, update:{date, ago}}. 출시일이 날짜가 아니면(출시 예정 등) 원문, 업데이트가 날짜가 아니면(…) null. 둘 다 없으면 null
const dateParts = (releaseText, updateText) => {
  const rel = (releaseText ?? '').trim();
  const date = shortDate(updateText ?? '');
  if (!rel && !date) return null;
  return {
    release: rel ? (shortDate(rel) ?? rel) : null,
    update: date ? { date, ago: (updateText.match(/\(([^)]+)\)/) ?? [])[1] ?? null } : null,
  };
};

// 4자리 이상 정수에 천 단위 쉼표 ('₩ 11000' → '₩ 11,000'); 이미 쉼표 있으면 그대로
const commas = (s) => s.replace(/\d{4,}/g, (d) => d.replace(/\B(?=(\d{3})+$)/g, ','));

// 가격 문자열 둘의 할인율 '-50%'. 정가 이하가 아니면 '0%', 숫자 없으면 null. 숫자만 비교(ponytail: 소수 자릿수가 같은 통화 쌍 전제)
const pctOff = (price, base) => {
  const n = (s) => Number(s.replace(/\D/g, ''));
  const p = n(price);
  const b = n(base);
  if (!p || !b) return null;
  return p >= b ? '0%' : `-${Math.round((1 - p / b) * 100)}%`;
};

const parseSteamdbTop = (bTexts) => {
  if (!Array.isArray(bTexts)) return null;
  const price = (bTexts[0] ?? '').trim();
  if (!price || price === '…') return null;
  const d = (bTexts[1] ?? '').trim();
  const discount = /^-\d+%$/.test(d) ? d : null;
  return { price: commas(price), discount };
};

const httpUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
};

// 큐레이터 평가 data-props JSON → 패치 링크들 [{url, desc}]. link_url이 있으면 그것 하나, 없으면 blurb의 모든 http(s) URL.
// desc = 그 URL 바로 앞 문구(직전 URL 이후부터, 끝의 '링크:' 제거) — 한 평가문에 여러 패치가 있을 때 제작자를 URL별로 구분.
const curatorLinks = (propsJson) => {
  let r;
  try {
    r = JSON.parse(propsJson)?.recommendation;
  } catch {
    return [];
  }
  if (!r) return [];
  const linkUrl = httpUrl(r.link_url);
  if (linkUrl) return [{ url: linkUrl, desc: '' }];
  const blurb = String(r.blurb ?? '');
  const out = [];
  let from = 0;
  for (const m of blurb.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = httpUrl(m[0].replace(/[),.]+$/, ''));
    const desc = blurb.slice(from, m.index).replace(/링크\s*[:：]?\s*$/, '').trim();
    from = m.index + m[0].length;
    if (url && !out.some((x) => x.url === url)) out.push({ url, desc });
  }
  return out;
};

// 링크 중복 판별 키(프로토콜·www·끝 슬래시·해시 무시). http(s) URL이 아니면 null.
const urlKey = (u) => {
  const h = httpUrl(u);
  if (!h) return null;
  const x = new URL(h);
  return x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search;
};

const api = { extractAuthor, hltbHours, parseHltbLines, parseSteamdbTop, curatorLinks, dateParts, commas, pctOff, urlKey };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.RelayParse = api;
