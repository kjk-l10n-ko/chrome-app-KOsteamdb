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

// '25½ Hours' → '25.5 h', '30 Minutes' → '0.5 h'(소수 첫째 자리, 최소 0.1), 그 외('—')는 그대로
const hltbHours = (text) => {
  const s = text.trim();
  const m = s.match(/^(\d*)(½?)\s*(Hours?|Minutes?)$/);
  if (!m || (!m[1] && !m[2])) return s;
  let h = Number(m[1] || 0) + (m[2] ? 0.5 : 0);
  if (m[3].startsWith('Minute')) h = Math.max(0.1, Math.round(h / 6) / 10);
  return `${h} h`;
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

// SteamDB ko 'dateStyle: medium' 날짜 '2025. 3. 14.' → '2025년 3월 14일'
const koDate = (text) => text.replace(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./, '$1년 $2월 $3일');

const parseSteamdbTop = (bTexts) => {
  if (!Array.isArray(bTexts)) return null;
  const price = (bTexts[0] ?? '').trim();
  if (!price || price === '…') return null;
  const d = (bTexts[1] ?? '').trim();
  const discount = /^-\d+%$/.test(d) ? d : null;
  return { price, discount };
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

const api = { extractAuthor, hltbHours, parseHltbLines, parseSteamdbTop, curatorLink, koDate };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.RelayParse = api;
