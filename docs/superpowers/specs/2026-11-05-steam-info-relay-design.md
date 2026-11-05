# Steam Info Relay — 설계

날짜: 2026-11-05 · 상태: 승인됨

## 목표

`https://store.steampowered.com/app/*` 에서 세 확장이 그린 결과를 **가로채** 게임 정보 탭(`#glanceMidCtn`)에 Steam 기본 행 형식으로 재표시하고, 원래 블록은 숨긴다. 데이터를 직접 조회하지 않는다 — 세 확장이 설치·활성화된 상태가 전제. 유일한 예외: KOSTEAM이 준 퀘이사존 큐레이터 링크를 실제 패치 링크로 바꾸기 위한 같은 origin 큐레이터 페이지 조회(행 1 참고).

| 소스 확장 (조사 버전) | 원본 DOM | 위치 | 특성 |
|---|---|---|---|
| Steam HLTB 0.0.2 (`cnfpnjgnkmonaeincdllnfeopmnngiin`) | `div#hltb-glance.dev_row` > `.subtitle.column`("HowLongToBeat:") + `div`(텍스트 3줄, `<br>` 구분) | `#glanceMidCtn .dev_row:last-child` 뒤 | React, inline, Shadow DOM 없음. 1회 렌더 |
| SteamDB 4.37 (`kdbmhfkmnlmbkgbabkdealhhbfhlmmon`) | `a.steamdb_prices` > `.steamdb_prices_top`(최저가) / `.steamdb_prices_bottom`(날짜) | `#game_area_purchase` afterbegin | 먼저 `…` 표시 → 비동기 응답 후 `innerHTML` 교체, 실패 시 요소 `remove()`. 무료 게임은 미생성 |
| KOSTEAM 1.6.7 (`cbcganplchikpgchgppklcblpjibhnnc`) | `div.kr-patch-banner` > `.kr-patch-type-label` + `.kr-patch-data-area`(`.kr-patch-link-item` 목록 또는 안내문) | 구매 영역 위, Steam "한국어 미지원" 안내를 `replaceWith`로 대체 | 로딩→결과, 언어표 변경 시마다 `replaceWith` 재렌더 |

유지: 세 확장의 위 세 블록 외 모든 기능(SteamDB 링크·동접자 등, KoSteam 장바구니·검색 우회·커뮤니티, HLTB의 `.apphub_OtherSiteInfo` 링크).

## 비목표

- 데이터 자체 조회/캐시, 옵션 페이지, 상점 외 페이지, Firefox 지원.

## 구조 (MV3, 빌드 없음)

```
manifest.json   content_scripts: matches https://store.steampowered.com/app/*, js [parse.js, content.js], css [hide.css], run_at document_idle. permissions 없음.
hide.css        #hltb-glance, .steamdb_prices, .kr-patch-banner { display: none !important; }
parse.js        순수 함수 (DOM 비의존 문자열 처리) — 전역 객체 하나로 노출, Node 테스트에서도 로드 가능
content.js      셀렉터 상수, 소스 읽기, 렌더, MutationObserver
parse.test.mjs  node --test
```

## 동작

### 동기화 루프
- `MutationObserver(document.body, { childList: true, subtree: true, characterData: true })` → `requestAnimationFrame`으로 디바운스 → `sync()`.
- `sync()`: 세 소스를 읽어 행 모델 `[{label, nodes}]` 생성 → 직렬화 키(텍스트+href)가 직전과 같으면 아무것도 하지 않음(자기 변경으로 인한 루프 방지).
- 컨테이너: `div#kr-relay` (`display: contents`, `.dev_row` 아님). 매 sync마다 `#glanceMidCtn`의 태그 열 `.glance_ctn_responsive_right` 바로 앞(태그가 맨 아래)으로 이동, 태그 열이 없으면 끝. 왼쪽 열(`.glance_ctn_responsive_left`) 안에 넣지 않는 이유: 그러면 우리 마지막 행이 HLTB 앵커 `#glanceMidCtn .dev_row:last-child`에 먼저 매칭돼 HLTB가 우리 컨테이너 안에 마운트된다. 현재 위치에선 HLTB가 실제 마지막 dev_row(배급사) 뒤에 붙고, 숨겨진다. 한계: Steam 반응형 ≤560px(두 열 float) 레이아웃에선 행 배치가 어색할 수 있음.
- `#glanceMidCtn` 없음(연령 확인 페이지 등) → 아무것도 안 함.

### 행 형식 (표시 순서 고정)
각 행: `<div class="dev_row"><div class="subtitle column">{라벨}</div><div style="color:#8f98a0">{값}</div></div>` (HLTB 원본과 동일, 첫 행 `margin-top: 10px`). 값 안의 링크는 Steam 링크색 `#66c0f4`(hover `#fff`). 값은 `textContent`/`createElement`로만 구성 — `innerHTML` 미사용.

1. **`한글 여부:`** (소스 `.kr-patch-banner`)
   - 유형 라벨이 `.official-steam`(`공식 한국어`) 또는 `.official-with-user`(`공식(추가정보 존재)`) → 맨 앞에 녹색(`#6c3` = SteamDB 평가 `.steamdb_rating_good`) `공식 한글화`, 패치 링크 아이템이 있으면 ` | `로 이어서 표시(`공식 한글화 | 한글 패치(Kiss)`). `공식지원 추정`·다이렉트 게임즈·스토브는 아래 규칙 그대로.
   - `.kr-patch-link-item` 각각 → 링크 1개: `href` = `a.kr-patch-link-text`의 href(큐레이터 링크면 아래 직접 링크로 교체), `target="_blank" rel="noopener noreferrer"`, 텍스트 = `한글 패치({이름})`, `title` = 설명 원문(줄바꿈은 ` / `).
   - 설명(`.kr-patch-link-description`) 중 하나라도 `공식`을 포함하는 아이템은 표시하지 않는다(공식 한글화는 위 `공식 한글화` 표기로 충분). 아이템이 모두 걸러지면 유형 라벨 텍스트.
   - 큐레이터 링크(같은 origin, `curator_clanid` 파라미터 有): href당 1회 `fetch`(쿠키 포함) → `DOMParser`로 `[data-featuretarget="referring-curator-review"]`의 `data-props` JSON → `curatorLink`: `recommendation.link_url`, 없으면 `blurb`의 첫 `http(s)://` URL(끝 `),.` 제거). http(s)가 아니거나 없음/실패 → 큐레이터 링크 유지. 결과는 메모리 캐시, 확정 시 재동기화.
   - 이름 = 그 아이템의 `.kr-patch-link-description`들에 `extractAuthor` 적용 → 결과 중복 제거 후 `, ` 결합. 결과 없음 → 사이트명(`.kr-patch-link-text` 텍스트에서 `[`·`]` 문자만 제거, 예: `[ 한패넷 ]`→`한패넷`).
   - 링크 구분자 ` | `.
   - 링크 아이템 0개 → `.kr-patch-type-label` 텍스트(예: `공식 한국어`, `한국어 없음`, `정보 조회 중`).
   - 배너 없음 → 행 생략.
2. **`플레이타임:`** (소스 `#hltb-glance`의 두 번째 `div`의 **텍스트 노드들**을 `\n`으로 결합 — 원본이 `display:none`이라 `innerText`는 `<br>` 줄바꿈을 잃음)
   - `parseHltbLines(raw)` → 고정 순서 `[{name, value}]`: `Main Story`→`메인`, `Main + Sides`→`메인+서브`, `Completionist`→`완전 정복`; 없는 항목 생략, 전부 없음 → 행 생략.
   - `hltbHours(text)`: `25½ Hours`→`25.5시간`, `1 Hour`→`1시간`(숫자와 붙여씀), 분은 소수 시간(`30 Minutes`→`0.5시간`, 소수 첫째 자리, 최소 `0.1시간`); `—` 그대로.
   - 표시: 값 칸에 이름/값 2열 그리드(`.kr-relay-grid`, `max-content` 2열, 간격 16px) — 탭 정렬된 3줄.
3. **`가격:`**
   - 표시는 이름/값 2열 그리드 2줄: `현재  ₩ 21,000(-50%)` / `최저  ₩ 11,000(-75%)`(최저 값이 SteamDB 앱 페이지 링크). 한쪽만 있으면 그 줄만. 현재가 `0`·숫자 없음(무료) 이고 최저도 없으면 행 생략.
   - 현재가: `#game_area_purchase .game_area_purchase_game` 첫 요소에서 `.discount_final_price` + `.discount_pct`, 없으면 `.game_purchase_price`. **할인율 괄호는 항상 표기**: 할인 없음 → `(0%)`.
   - 최저가: `parseSteamdbTop(bTexts)` — `.steamdb_prices_top b` 텍스트 배열. `b[0]` = 가격(4자리 이상 정수에 천 단위 쉼표 부여: `₩ 11000`→`₩ 11,000`); `b[1]`이 `/^-\d+%$/`면 그 할인율. 없으면(정가 최저/2년 최저 변형) 구매 박스 정가(`.discount_original_price`, 할인 없으면 현재가) 대비 `pctOff` 계산(정가 이상이면 `0%`, 정가를 못 구하면 괄호 생략). `b[0]`이 `…`이거나 요소 없음 → 최저 줄 없음.

### `extractAuthor(desc)` (parse.js)
순서대로 첫 매치:
1. `/([^\s:\-|/,()\[\]]+)\s*님/` → 그룹 1 (`Zvezda님 제작`→`Zvezda`, `유저 한국어 패치 - QR 님`→`QR`)
2. `/제작(?:자|팀)\s*[:：]\s*([^\n]+)/` → 그룹 1 trim, 단 `정보없음` 포함 시 불일치 (`제작자 : 막셋`→`막셋`, `제작팀 : Team WASD`→`Team WASD`)
3. `/패치\s*-\s*(\S+)/` → 그룹 1 (`유저 한글 패치 - 한무테`→`한무테`)
4. 없음 → `null`

KoSteam `lookup.json`(2026-11-05) 설명 6,911건 대상 1~3 기준 70% 추출; 나머지는 `제작자 : 정보없음`/빈 문자열/`백업용`/`스토브 인디 한국어화` 등 제작자 정보 자체가 없는 문구.

## 실패 처리

- 셀렉터 불일치·소스 확장 미설치 → 해당 행만 생략. 원본은 CSS로 계속 숨김(승인된 트레이드오프: 소스 DOM이 바뀌면 그 정보가 사라짐; 셀렉터는 `content.js` 상단 상수 한 곳).
- KoSteam 배너가 숨겨지면 그것이 대체한 Steam "한국어 미지원" 안내도 안 보임 → `한국어 없음` 행이 대신 전달.

## SteamDB `최근 업데이트` 날짜 (제자리 수정)

SteamDB가 그리는 `.dev_row.steamdb_last_update > a.date`(및 반응형 `#appHeaderGridContainer a[href$="/patchnotes/"]`)는 숨기지 않고 위치도 그대로 둔다. 첫 텍스트 노드에 `koDate` 적용: `2025. 3. 14.`(ko `dateStyle: medium`) → `2025년 3월 14일`, 뒤의 `(8개월 전)`은 유지. 멱등이라 관찰자 루프 없음; SteamDB의 비동기 채움 후에도 다음 sync가 변환.

## 테스트

- `node --test parse.test.mjs`: `extractAuthor`(위 예시 전부 + `제작자 : 정보없음`→`null`, `''`→`null`), `hltbHours`(`25½ Hours`, `1 Hour`, `30/45/1 Minutes`, `—`), `parseHltbLines`(순서·생략), `koDate`(변환·보존·멱등), `parseSteamdbTop`(할인 변형, 2년 최저가 변형, `…`), `curatorLink`.
- 수동: Chrome에 세 확장 + 압축해제 로드 후 `/app/1250/`(유저패치 2소스), `/app/1145360/`(공식 한국어·할인 여부), 무료 게임(가격 행에 현재가만 또는 생략) 확인. 원본 세 블록이 안 보이고 SteamDB·KoSteam 나머지 UI는 보이는지 확인.
