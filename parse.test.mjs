import test from 'node:test';
import assert from 'node:assert/strict';
import p from './parse.js';
const { extractAuthor, hltbHours, parseHltbLines, parseSteamdbTop, curatorLinks, dateParts, commas, pctOff, urlKey } = p.default ?? p;

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
  assert.equal(extractAuthor('유저 한국어 패치 ① - Team.SM,\n\n링크:'), 'Team.SM', '번호 ①/②/1 허용, 끝 쉼표 제외');
  assert.equal(extractAuthor('유저 한국어 패치 ② - 행복한나라 님,'), '행복한나라');
});
test('extractAuthor: 제작자 없는 문구 → null', () => {
  assert.equal(extractAuthor(''), null);
  assert.equal(extractAuthor('백업용'), null);
  assert.equal(extractAuthor('스토브 인디 한국어화'), null);
  assert.equal(extractAuthor('실제로는 한글 지원'), null);
});
test('hltbHours: ½→.5, 시간 붙여쓰기, 분→소수 시간', () => {
  assert.equal(hltbHours('25½ Hours'), '25.5시간');
  assert.equal(hltbHours('1 Hour'), '1시간');
  assert.equal(hltbHours('½ Hour'), '0.5시간');
  assert.equal(hltbHours('30 Minutes'), '0.5시간');
  assert.equal(hltbHours('45 Minutes'), '0.8시간');
  assert.equal(hltbHours('1 Minute'), '0.1시간'); // 0으로 반올림되지 않게 최소 0.1
  assert.equal(hltbHours('—'), '—');
});
test('commas: 4자리 이상 정수에 천 단위 쉼표, 이미 있으면 그대로', () => {
  assert.equal(commas('₩ 11000'), '₩ 11,000');
  assert.equal(commas('₩ 1234567'), '₩ 1,234,567');
  assert.equal(commas('₩ 11,000'), '₩ 11,000');
  assert.equal(commas('₩ 990'), '₩ 990');
  assert.equal(commas('$ 12.99'), '$ 12.99');
});
test('pctOff: 가격 문자열 둘의 할인율, 정가 이상이면 0%', () => {
  assert.equal(pctOff('₩ 11,000', '₩ 22,000'), '-50%');
  assert.equal(pctOff('₩ 5,500', '₩ 22,000'), '-75%');
  assert.equal(pctOff('₩ 22,000', '₩ 22,000'), '0%');
  assert.equal(pctOff('₩ 30,000', '₩ 22,000'), '0%');
  assert.equal(pctOff('₩ 11,000', '무료'), null);
});
test('urlKey: 같은 링크는 같은 키 (프로토콜/www/끝 슬래시/해시 무시), 다른 경로·쿼리는 다른 키', () => {
  const k = urlKey('http://cafe.naver.com/fpsgame/1563504');
  assert.equal(urlKey('https://cafe.naver.com/fpsgame/1563504'), k);
  assert.equal(urlKey('https://www.cafe.naver.com/fpsgame/1563504/#x'), k);
  assert.equal(urlKey('https://CAFE.naver.com/fpsgame/1563504/'), k);
  assert.notEqual(urlKey('https://cafe.naver.com/fpsgame/1563505'), k);
  assert.notEqual(urlKey('http://steamcommunity.com/sharedfiles/filedetails/?id=1'), urlKey('http://steamcommunity.com/sharedfiles/filedetails/?id=2'));
});
test('urlKey: http(s)가 아니거나 URL이 아니면 null', () => {
  assert.equal(urlKey('javascript:alert(1)'), null);
  assert.equal(urlKey('not a url'), null);
  assert.equal(urlKey(''), null);
});
test('parseSteamdbTop: 가격에 쉼표 부여', () => {
  assert.deepEqual(parseSteamdbTop(['₩ 11000', '-75%']), { price: '₩ 11,000', discount: '-75%' });
  assert.deepEqual(parseSteamdbTop(['₩ 11,000', '-75%']), { price: '₩ 11,000', discount: '-75%' });
  // 2년-최저가 변형: b[1]은 가격(퍼센트 아님)
  assert.deepEqual(parseSteamdbTop(['₩ 11,000', '₩ 22,000']), { price: '₩ 11,000', discount: null });
  assert.equal(parseSteamdbTop(['…']), null);
  assert.equal(parseSteamdbTop([]), null);
});
test('parseHltbLines: 고정 순서 [{name, value}], 없는 항목 생략', () => {
  const raw = 'Main Story: 25½ Hours\nMain + Sides: 40 Hours\nCompletionist: 80 Hours';
  assert.deepEqual(parseHltbLines(raw), [
    { name: '메인', value: '25.5시간' }, { name: '메인+서브', value: '40시간' }, { name: '완전 정복', value: '80시간' },
  ]);
  assert.deepEqual(parseHltbLines('Completionist: —\nMain Story: 3 Hours'), [
    { name: '메인', value: '3시간' }, { name: '완전 정복', value: '—' },
  ]);
  assert.equal(parseHltbLines(''), null);
});
test('dateParts: 출시일 + 업데이트(날짜, 상대시간), yy.mm.dd', () => {
  assert.deepEqual(dateParts('2009년 5월 14일', '2025. 3. 14. (8개월 전)'),
    { release: '09.05.14', update: { date: '25.03.14', ago: '8개월 전' } });
  assert.deepEqual(dateParts('2020년 11월 5일', '2025년 11월 25일 (3일 전)'),
    { release: '20.11.05', update: { date: '25.11.25', ago: '3일 전' } });
  assert.deepEqual(dateParts('2009년 5월 14일', '2025. 3. 14.'),
    { release: '09.05.14', update: { date: '25.03.14', ago: null } }, '상대시간 없으면 null');
});
test('dateParts: 한쪽만 있으면 그쪽만, 날짜가 아니면 원문 유지', () => {
  assert.deepEqual(dateParts('2009년 5월 14일', null), { release: '09.05.14', update: null });
  assert.deepEqual(dateParts('2009년 5월 14일', '…'), { release: '09.05.14', update: null }, 'SteamDB 로딩 중');
  assert.deepEqual(dateParts('출시 예정', null), { release: '출시 예정', update: null });
  assert.deepEqual(dateParts('2025년 3분기', '2025. 3. 14. (8개월 전)'),
    { release: '2025년 3분기', update: { date: '25.03.14', ago: '8개월 전' } });
  assert.deepEqual(dateParts(null, '2025. 3. 14. (8개월 전)'),
    { release: null, update: { date: '25.03.14', ago: '8개월 전' } });
  assert.equal(dateParts(null, null), null);
  assert.equal(dateParts('', '…'), null);
});

const props = (link_url, blurb) => JSON.stringify({ recommendation: { link_url, blurb } });
test('curatorLinks: blurb의 http(s) URL들, 각 URL 앞 문구가 desc (실제 퀘이사존 큐레이터 샘플)', () => {
  assert.deepEqual(curatorLinks(props('', '유저 한국어 패치 - Kiss 님,\n\n링크: https://cafe.naver.com/fpsgame/1563504\n\n')),
    [{ url: 'https://cafe.naver.com/fpsgame/1563504', desc: '유저 한국어 패치 - Kiss 님,' }]);
  assert.deepEqual(curatorLinks(props('', '유저 한국어 패치 링크: https://kimangdae.tistory.com/74')),
    [{ url: 'https://kimangdae.tistory.com/74', desc: '유저 한국어 패치' }]);
  assert.deepEqual(curatorLinks(props('', '유저 한국어 패치 - https://arie.tistory.com/164\n\n')),
    [{ url: 'https://arie.tistory.com/164', desc: '유저 한국어 패치 -' }]);
});
test('curatorLinks: 한 평가문에 링크가 둘 (Kero Blaster)', () => {
  const blurb = '유저 한국어 패치 ① - Team.SM,\n\n링크: http://team-sm.tistory.com/14\n\n\n\n유저 한국어 패치 ② - 행복한나라 님,\n\n링크: https://blog.naver.com/dlwlghks8779/222084145494\n\n';
  assert.deepEqual(curatorLinks(props('', blurb)), [
    { url: 'http://team-sm.tistory.com/14', desc: '유저 한국어 패치 ① - Team.SM,' },
    { url: 'https://blog.naver.com/dlwlghks8779/222084145494', desc: '유저 한국어 패치 ② - 행복한나라 님,' },
  ]);
});
test('curatorLinks: link_url 우선, 끝 구두점 제거, 같은 URL 중복 제거', () => {
  assert.deepEqual(curatorLinks(props('https://a.example/x', '링크: https://b.example/y')), [{ url: 'https://a.example/x', desc: '' }]);
  assert.deepEqual(curatorLinks(props('', '링크: https://b.example/y).')), [{ url: 'https://b.example/y', desc: '' }]);
  assert.equal(curatorLinks(props('', 'https://b.example/y 그리고 https://b.example/y')).length, 1);
});
test('curatorLinks: 쓸 수 있는 링크 없음 → []', () => {
  assert.deepEqual(curatorLinks(props('', '유저 한국어 패치')), []);
  assert.deepEqual(curatorLinks(props('javascript:alert(1)', '')), []);
  assert.deepEqual(curatorLinks('{"recommendation":null}'), []);
  assert.deepEqual(curatorLinks('not json'), []);
});
