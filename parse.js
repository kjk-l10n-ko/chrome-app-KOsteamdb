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

// '출시일 | 업데이트일 (8개월 전)'. 출시일이 날짜가 아니면(출시 예정 등) 원문, 업데이트가 날짜가 아니면(…) 생략. 둘 다 없으면 null
const dateLine = (releaseText, updateText) => {
  const rel = (releaseText ?? '').trim();
  const out = [];
  if (rel) out.push(shortDate(rel) ?? rel);
  const upd = shortDate(updateText ?? '');
  if (upd) {
    const ago = (updateText.match(/\(([^)]+)\)/) ?? [])[1];
    out.push(ago ? `${upd} (${ago})` : upd);
  }
  return out.length ? out.join(' | ') : null;
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

// 큐레이터 평가 data-props JSON → 실제 패치 링크 (link_url 우선, 없으면 blurb 첫 URL)
const curatorLink = (propsJson) => {
  let r;
  try {
    r = JSON.parse(propsJson)?.recommendation;
  } catch {
    return null;
  }
  if (!r) return null;
  const inBlurb = String(r.blurb ?? '').match(/https?:\/\/[^\s<>"']+/)?.[0]?.replace(/[),.]+$/, '');
  return httpUrl(r.link_url) ?? httpUrl(inBlurb);
};

// 링크 중복 판별 키(프로토콜·www·끝 슬래시·해시 무시). http(s) URL이 아니면 null.
const urlKey = (u) => {
  const h = httpUrl(u);
  if (!h) return null;
  const x = new URL(h);
  return x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search;
};

const api = { extractAuthor, hltbHours, parseHltbLines, parseSteamdbTop, curatorLink, dateLine, commas, pctOff, urlKey };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.RelayParse = api;
