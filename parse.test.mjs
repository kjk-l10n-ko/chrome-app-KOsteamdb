import test from 'node:test';
import assert from 'node:assert/strict';
import p from './parse.js';
const { extractAuthor, translateHltb, parseHltbLines, parseSteamdbTop, curatorLink } = p.default ?? p;

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

const props = (link_url, blurb) => JSON.stringify({ recommendation: { link_url, blurb } });
test('curatorLink: blurb의 첫 http(s) URL (실제 퀘이사존 큐레이터 샘플)', () => {
  assert.equal(curatorLink(props('', '유저 한국어 패치 - Kiss 님,\n\n링크: https://cafe.naver.com/fpsgame/1563504\n\n')),
    'https://cafe.naver.com/fpsgame/1563504');
  assert.equal(curatorLink(props('', '유저 한국어 패치 - QR 님,\n\n링크: http://steamcommunity.com/sharedfiles/filedetails/?id=513304103\n\n\n\n')),
    'http://steamcommunity.com/sharedfiles/filedetails/?id=513304103');
  assert.equal(curatorLink(props('', '유저 한국어 패치 링크: https://kimangdae.tistory.com/74')),
    'https://kimangdae.tistory.com/74');
  assert.equal(curatorLink(props('', '유저 한국어 패치 - https://arie.tistory.com/164\n\n')),
    'https://arie.tistory.com/164');
});
test('curatorLink: link_url 우선, 끝 구두점 제거', () => {
  assert.equal(curatorLink(props('https://a.example/x', '링크: https://b.example/y')), 'https://a.example/x');
  assert.equal(curatorLink(props('', '링크: https://b.example/y).')), 'https://b.example/y');
});
test('curatorLink: 쓸 수 있는 링크 없음 → null', () => {
  assert.equal(curatorLink(props('', '유저 한국어 패치')), null);
  assert.equal(curatorLink(props('javascript:alert(1)', '')), null);
  assert.equal(curatorLink('{"recommendation":null}'), null);
  assert.equal(curatorLink('not json'), null);
});
