# Steam Info Relay — 설계

날짜: 2026-11-05 · 상태: 승인됨

## 목표

`https://store.steampowered.com/app/*` 에서 세 확장이 그린 결과를 **가로채** 게임 정보 탭(`#glanceMidCtn`)에 Steam 기본 행 형식으로 재표시하고, 원래 블록은 숨긴다. 데이터를 직접 조회하지 않는다 — 세 확장이 설치·활성화된 상태가 전제. 유일한 예외: KOSTEAM이 준 패치 링크를 실제 패치 링크로 바꾸기 위한 조회(퀘이사존 큐레이터 페이지 = 같은 origin, 한패넷 게임 페이지 = `https://hanpe.net/app/*`, 행 1 참고).

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
manifest.json   content_scripts: matches https://store.steampowered.com/app/*, js [parse.js, content.js], css [hide.css], run_at document_idle. background service_worker background.js, host_permissions ["https://hanpe.net/*"] (그 외 권한 없음).
background.js   메시지 {type:'fetchHanpe', url} → https://hanpe.net/app/* 만 fetch해 HTML 텍스트 응답(그 외 null). hanpe.net은 CORS 헤더가 없어 content script에서 직접 fetch 불가.
hide.css        #hltb-glance, .steamdb_prices, .kr-patch-banner, #glanceMidCtn .release_date, .steamdb_last_update { display: none !important; }
parse.js        순수 함수 (DOM 비의존 문자열 처리) — 전역 객체 하나로 노출, Node 테스트에서도 로드 가능
content.js      셀렉터 상수, 소스 읽기, 렌더, MutationObserver
parse.test.mjs  node --test
```

## 동작

### 동기화 루프
- `MutationObserver(document.body, { childList: true, subtree: true, characterData: true })` → `requestAnimationFrame`으로 디바운스 → `sync()`.
- `sync()`: 세 소스를 읽어 행 모델 `[{label, nodes}]` 생성 → 직렬화 키(텍스트+href)가 직전과 같으면 아무것도 하지 않음(자기 변경으로 인한 루프 방지).
- 컨테이너: `div#kr-relay` (일반 block, `.dev_row` 아님 — `display: contents`로 하면 Steam wide 레이아웃의 `#glanceMidCtn{display:flex;flex-direction:column;justify-content:space-around}` 때문에 각 행이 별개 flex 아이템이 돼 남는 높이가 행 사이로 분배되어 간격이 벌어진다. hide.css가 `#glanceMidCtn{justify-content:flex-start}`로 위에서부터 쌓는다). 매 sync마다 `#glanceMidCtn`의 태그 열 `.glance_ctn_responsive_right` 바로 앞(태그가 맨 아래)으로 이동, 태그 열이 없으면 끝. 왼쪽 열(`.glance_ctn_responsive_left`) 안에 넣지 않는 이유: 그러면 우리 마지막 행이 HLTB 앵커 `#glanceMidCtn .dev_row:last-child`에 먼저 매칭돼 HLTB가 우리 컨테이너 안에 마운트된다. 현재 위치에선 HLTB가 실제 마지막 dev_row(배급사) 뒤에 붙고, 숨겨진다. 한계: Steam 반응형 ≤560px(두 열 float) 레이아웃에선 행 배치가 어색할 수 있음.
- `#glanceMidCtn` 없음(연령 확인 페이지 등) → 아무것도 안 함.

### 행 형식 (표시 순서 고정)
각 행: `<div class="dev_row"><div class="subtitle column">{라벨}</div><div style="color:#8f98a0">{값}</div></div>` (HLTB 원본과 동일, 첫 행 `margin-top: 10px`). 값 안의 링크는 Steam 링크색 `#66c0f4`(hover `#fff`). 값은 `textContent`/`createElement`로만 구성 — `innerHTML` 미사용.

1. **`한글 여부:`** (소스 `.kr-patch-banner`)
   - 유형 라벨이 `.official-steam`(`공식 한국어`) 또는 `.official-with-user`(`공식(추가정보 존재)`) → 맨 앞에 녹색(`#6c3` = SteamDB 평가 `.steamdb_rating_good`) `공식 한글화`, 패치 링크 아이템이 있으면 ` | `로 이어서 표시(`공식 한글화 | 한글 패치 (Kiss)`). `공식지원 추정`·다이렉트 게임즈·스토브는 아래 규칙 그대로.
   - `.kr-patch-link-item` 각각 → 링크 1개: `href` = `a.kr-patch-link-text`의 href(큐레이터 링크면 아래 직접 링크로 교체), `target="_blank" rel="noopener noreferrer"`, 텍스트 = `한글 패치 ({이름})`, `title` = 설명 원문(줄바꿈은 ` / `).
   - 설명(`.kr-patch-link-description`) 중 하나라도 `공식`을 포함하는 아이템은 표시하지 않는다(공식 한글화는 위 `공식 한글화` 표기로 충분). 아이템이 모두 걸러지면 유형 라벨 텍스트.
   - 링크 확장(`expand(href)`, href당 1회 조회, 결과 메모리 캐시, 확정 시 재동기화, 조회 중/실패 시 원래 링크 표시):
     - 큐레이터 링크(같은 origin, `curator_clanid` 파라미터 有): `fetch`(쿠키 포함) → `DOMParser`로 `[data-featuretarget="referring-curator-review"]`의 `data-props` JSON → `curatorLink`: `recommendation.link_url`, 없으면 `blurb`의 첫 `http(s)://` URL(끝 `),.` 제거) → 링크 1개.
     - 한패넷 링크(`https://hanpe.net/*`): background 경유로 페이지 HTML → `DOMParser` → `<h2>`가 `한글패치`인 `section` 안의 `a[href^="/han/"]`(href는 한패 클릭 카운터, **텍스트가 실제 패치 URL**) 각각 → 링크 1개, 설명은 같은 블록의 `<p>`. 이름은 그 설명에 `extractAuthor`(없으면 원래 아이템의 이름/사이트명). http(s)가 아닌 URL은 버림. (36개 한패 페이지 표본에서 링크 텍스트는 전부 완전한 URL.)
     - 확장된 링크의 설명이 `공식`을 포함하면 표시하지 않는다(아래 규칙과 동일).
   - **중복 제거**: 링크 키 `urlKey`(프로토콜·`www.`·끝 슬래시·해시 무시, 호스트 소문자) 기준으로 하나만 표시. 먼저 나온 링크의 URL을 유지하되, 먼저 것이 이름 없음(사이트명 대체)이고 중복이 이름 있으면 이름 있는 쪽으로 교체.
   - 이름 = 그 아이템의 `.kr-patch-link-description`들에 `extractAuthor` 적용 → 결과 중복 제거 후 `, ` 결합. 결과 없음 → 사이트명(`.kr-patch-link-text` 텍스트에서 `[`·`]` 문자만 제거, 예: `[ 한패넷 ]`→`한패넷`).
   - 링크 구분자 ` | `.
   - 링크 아이템 0개 → `.kr-patch-type-label` 텍스트(예: `공식 한국어`, `한국어 없음`, `정보 조회 중`).
   - 배너 없음 → 행 생략.
2. **`플레이타임:`** (소스 `#hltb-glance`의 두 번째 `div`의 **텍스트 노드들**을 `\n`으로 결합 — 원본이 `display:none`이라 `innerText`는 `<br>` 줄바꿈을 잃음)
   - `parseHltbLines(raw)` → 고정 순서 `[{name, value}]`: `Main Story`→`메인`, `Main + Sides`→`메인+서브`, `Completionist`→`완전 정복`; 없는 항목 생략, 전부 없음 → 행 생략.
   - `hltbHours(text)`: `25½ Hours`→`25.5시간`, `1 Hour`→`1시간`(숫자와 붙여씀), 분은 소수 시간(`30 Minutes`→`0.5시간`, 소수 첫째 자리, 최소 `0.1시간`); `—` 그대로.
   - 표시: 값 칸에 이름/값 2열 그리드(`.kr-relay-grid`, `max-content` 2열, 간격 16px) — 탭 정렬된 3줄.
3. **`가격(현재/최저):`**
   - 값은 한 줄 `₩ 11,000 (-50%) | ₩ 5,500 (-75%)` (`{현재} | {최저}`). **현재가와 최저가가 같아도 둘 다 표시**. 최저 값이 SteamDB 앱 페이지 링크. 한쪽만 있으면 그쪽만(구분자 없이). 현재가 `0`·숫자 없음(무료) 이고 최저도 없으면 행 생략.
   - 현재가: `#game_area_purchase .game_area_purchase_game` 중 가격 요소(`.discount_final_price`/`.game_purchase_price`)가 있는 **첫 박스**(데모 다운로드 박스처럼 가격 없는 박스는 건너뜀, 예: `/app/2128270/`)에서 `.discount_final_price` + `.discount_pct`, 없으면 `.game_purchase_price`. **괄호 앞은 한 칸 띄움** (`₩ 11,000 (-50%)`), **할인율 괄호는 할인이 있을 때만**: 할인 없음(0%) → 괄호 생략.
   - 최저가: `parseSteamdbTop(bTexts)` — `.steamdb_prices_top b` 텍스트 배열. `b[0]` = 가격(4자리 이상 정수에 천 단위 쉼표 부여: `₩ 11000`→`₩ 11,000`); `b[1]`이 `/^-\d+%$/`면 그 할인율. 없으면(정가 최저/2년 최저 변형) 구매 박스 정가(`.discount_original_price`, 할인 없으면 현재가) 대비 `pctOff` 계산 — 결과가 `0%`(정가 이상)이거나 정가를 못 구하면 괄호 생략. `b[0]`이 `…`이거나 요소 없음 → 최저 없음.

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

## `출시/업데이트 일자:` 행 (원래 날짜 행과 같은 위치)

`#kr-relay`(태그 열 앞)가 아니라, Steam 출시일 행 `#glanceMidCtn .release_date`(왼쪽 열) **바로 앞**에 별도 행 `div#kr-date.dev_row`를 둔다(출시일 행이 없으면 왼쪽 열 첫 `.dev_row` 앞). 원본인 Steam 출시일 행과 SteamDB `.steamdb_last_update` 행은 hide.css로 숨긴다(수정하지 않음). 반응형 `#appHeaderGridContainer`(≤~910px)의 날짜는 건드리지 않는다(거기엔 우리 행이 보이지 않음).
- 값 `dateParts(release, update)` → `{release, update:{date, ago}}`, 표시는 `09.05.14 | 25.03.14 (8개월 전)` — `yy.mm.dd`(0 채움), 출시일 먼저. **업데이트 부분은 SteamDB 원본처럼 링크**(`a.date`, href = 원본 `a.date`의 `…/app/<id>/patchnotes/`, 새 탭 아님)이고 `(8개월 전)` 포함; 원본이 `.steamdb_last_update_old`(1년 넘음)를 붙였으면 같은 클래스를 복사해 SteamDB 자체 CSS가 빨갛게 칠한다. 색은 하드코딩하지 않음(출시일 텍스트 `#8f98a0`, 링크는 Steam 기본 링크색). 입력은 `.release_date .date` 텍스트(`2009년 5월 14일`)와 `.steamdb_last_update a.date` 텍스트(`2025. 3. 14. (8개월 전)`). `(8개월 전)`은 SteamDB 텍스트의 괄호 부분 그대로. 
- 출시일이 날짜가 아니면(`출시 예정`, `2025년 3분기`) 원문 그대로. SteamDB 날짜가 없거나 `…`(로딩)·제거(실패)면 출시일만(구분자 없음). 둘 다 없으면 행 없음.
- 행 여백: Steam `.glance_ctn .release_date`와 같은 `padding: 9px 0 13px`(위아래).
- 매 `sync()`마다 갱신(멱등: 키(날짜·href·old)와 위치가 같으면 변경 없음) — SteamDB의 비동기 채움을 따라간다.

## 테스트

- `node --test parse.test.mjs`: `extractAuthor`(위 예시 전부 + `제작자 : 정보없음`→`null`, `''`→`null`), `hltbHours`(`25½ Hours`, `1 Hour`, `30/45/1 Minutes`, `—`), `parseHltbLines`(순서·생략), `dateParts`(둘 다/한쪽만/날짜 아님/로딩 `…`), `parseSteamdbTop`(할인 변형, 2년 최저가 변형, `…`), `curatorLink`, `urlKey`.
- 수동: Chrome에 세 확장 + 압축해제 로드 후 `/app/1250/`(유저패치 2소스), `/app/1145360/`(공식 한국어·할인 여부), 무료 게임(가격 행에 현재가만 또는 생략) 확인. 원본 세 블록이 안 보이고 SteamDB·KoSteam 나머지 UI는 보이는지 확인.
