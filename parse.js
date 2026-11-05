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
  const unit = line.replace(/\s*Hours?/, '시간').replace(/\s*Minutes?/, '분');
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

const api = { extractAuthor, translateHltb, parseHltbLines, parseSteamdbTop, curatorLink };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.RelayParse = api;
