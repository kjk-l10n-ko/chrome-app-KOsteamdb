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
