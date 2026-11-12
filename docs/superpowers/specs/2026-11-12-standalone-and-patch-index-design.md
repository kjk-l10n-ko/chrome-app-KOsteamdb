# Steam Info Relay — 단독 동작 + GitHub 한글패치 색인 설계

날짜: 2026-11-12 · 상태: 승인됨 (§1~§3)
선행 사양: `2026-11-05-steam-info-relay-design.md` — 행 형식·위치·링크 규칙은 그대로 유지하고, 이 문서는 **데이터 출처**와 **새 색인 저장소**만 바꾼다. 충돌하면 이 문서가 우선.

## 목표

- Steam HLTB·KOSTEAM 확장 없이 이 확장만으로 `플레이타임`·`한글 여부` 행을 그린다(각 확장이 쓰던 공개 API/데이터를 직접 사용).
- SteamDB 확장은 **설치돼 있다고 가정**한다(최저가·최근 업데이트는 지금처럼 SteamDB 확장 DOM에서 읽음).
- 한글패치 출처에서 스토브·다이렉트 게임즈를 뺀다.
- GitHub의 한글패치 저장소를 수집해 게임별 링크로 표시한다(릴리스가 있으면 릴리스, 없으면 저장소 메인).

## 비목표

- SteamDB 확장 없이 최저가/업데이트 날짜 얻기(SteamDB 가격 API는 확장 밖에서 400, IsThereAnyDeal은 키 필요 — 기각).
- SteamDB 평가·동시 접속자 등 이번 4개 행 외 기능의 이전.
- 옵션 페이지.

## §1 구조

### 저장소 (조직 `kjk-l10n-ko`, 둘 다 공개)

| 저장소 | 역할 |
|---|---|
| `steamDB-for-korean` | 크롬 확장 = 현재 프로젝트 (로컬 git 이력 그대로 push) |
| `steamDB-for-korean-db` | GitHub 한글패치 색인: 수집 스크립트, 매일 Actions, `data/github-patches.json` |

두 저장소의 유일한 접점은 `github-patches.json` 형식(§3.3)이다.

### 설치 전제 / 행별 출처

| 행 | 출처 | 변경 |
|---|---|---|
| 출시/업데이트 일자 | Steam 출시일 + SteamDB 확장 `.steamdb_last_update` | 없음 |
| 가격 (현재/최저) | Steam 구매 박스 + SteamDB 확장 `.steamdb_prices_top` | 없음 |
| 플레이타임 | `https://hltbapi.codepotatoes.de/steam/{appid}` (Steam HLTB 확장이 쓰는 API) | 신규 |
| 한글 여부 | KOSTEAM 데이터(`raw.githubusercontent.com/snowyegret23/KOSTEAM/refs/heads/main/data/{version,lookup,alias}.json`) + 색인 `github-patches.json` | 신규 |

### 확장 파일 변경

- `manifest.json`: `permissions: ["storage"]`, `host_permissions`에 `https://hltbapi.codepotatoes.de/*`, `https://raw.githubusercontent.com/*` 추가(`https://hanpe.net/*` 유지).
- `background.js`: 메시지 3종.
  - `{type:'fetchHanpe', url}` — 기존 그대로.
  - `{type:'hltb', appid}` → `{main, sides, completionist, id}` 또는 `null`. hltbapi는 CORS 헤더가 없어 background에서만 호출 가능. 404(미등록)·오류 → `null`. 결과는 서비스 워커 메모리에 appid별 캐시.
  - `{type:'patches', appid}` → `{kosteam: 항목|null, github: 항목[]}` 또는 아직 데이터가 하나도 없으면 `null`. 2MB 원본은 content script로 보내지 않는다.
- `content.js`: `#hltb-glance`·`.kr-patch-banner` 읽기 코드 삭제, 위 메시지 결과로 같은 행을 그린다. 응답이 오면 재동기화.
- `hide.css`: SteamDB 블록 숨김 유지. HLTB·KOSTEAM 블록 숨김도 유지(두 확장이 남아 있으면 중복 표시 방지).

### 플레이타임 값 변환

API는 시간 단위 소수(`mainStory: 17.45`, `mainStoryWithExtras`, `completionist`). 표시 규칙(기존 출력과 동일한 모양):
- 1시간 이상: 0.5 단위 반올림 → `17.5시간`, `54시간`.
- 1시간 미만(0 초과): 0.1 단위 반올림, 최소 `0.1시간`.
- 0·`null` → `—`. 세 값이 모두 없으면 행 생략.
순수 함수 `hltbValue(hours)`로 `parse.js`에 둔다(`hltbHours`/`parseHltbLines`의 문자열 파싱은 삭제).

## §2 `한글 여부` 행

### 데이터 받기 (background)

- 6시간마다(첫 요청 시 포함) `version.json`만 받아 `lookup_sha256`·`alias_sha256`이 저장본과 다를 때만 `lookup.json`·`alias.json`을 다시 받는다. 색인 `github-patches.json`은 같은 6시간 주기로 `_meta.generated_at`이 바뀌면 교체.
- 저장: `chrome.storage.local`(2MB대, 기본 10MB 한도 안). 서비스 워커가 깨면 한 번 읽어 메모리에 둔다.
- 조회 실패: 저장본이 있으면 그대로 사용. 저장본도 없으면 `patches` 응답 `null` → 행 미표시(데이터가 오면 재동기화).
- 게임 조회: `lookup[alias[appid] ?? appid]`.

### KOSTEAM 항목 → 링크 목록 (순수 함수 `patchEntries(lookupEntry, githubEntries)`)

- `patch_sources[i]`별 실제 주소 = `source_site_urls[patch_sources[i]]` (`links`는 해시값이라 사용 안 함). 허용 도메인: `steamapp`→`hanpe.net`, `quasarplay`→`store.steampowered.com`.
- `stove`·`directg` 출처는 버린다. 남는 출처가 없으면 그 KOSTEAM 항목은 없는 것으로 본다(KOSTEAM 데이터 기준 146개 게임).
- 설명 = `patch_descriptions[i]`, 이름은 기존 `extractAuthor`.
- 이후는 기존 규칙 그대로: 한패넷·큐레이터 링크 확장, 설명에 `공식` 포함 시 제외, 같은 링크(`urlKey`)·같은 제작자 중복 제거, `한글 패치 (이름)` 표기, 링크 구분자 ` | `.
- GitHub 항목: `한글 패치 ({owner})`, 주소 = 항목의 `url`, 툴팁 = `desc`. 같은 중복 제거를 거친다(KOSTEAM 링크가 먼저).

### 표시 판단

| 조건 (위에서부터 첫 일치) | 표시 |
|---|---|
| Steam이 한국어 지원 | 녹색 `공식 한글화` + 링크가 있으면 ` \| 링크…` |
| KOSTEAM 유형 `official` | `공식지원 추정` + 링크 |
| 링크가 하나라도 있음 | 링크들 |
| 그 외(데이터 없음 포함) | `한국어 없음` |

Steam 한국어 지원 판정(KOSTEAM `content.js`와 동일):
1. `.game_language_options` 표가 있으면: `td.ellipsis` 텍스트가 `Korean`/`한국어`(또는 `#review_language_koreana[data-language]` 값)인 `tr`이 `.unsupported`가 아니고 `td.checkcol` 중 `✔` 텍스트나 `span`이 하나라도 있으면 지원.
2. 표가 없으면 `[data-featuretarget="apppage-store-browse-cache"]`의 `data-props` JSON `rgPayloads[].rgStoreItems[]` 중 `item_type===0 && id===appid` 항목의 `supported_languages`에 `elanguage===4`이고 `supported`/`full_audio`/`subtitles` 중 하나가 참이면 지원.

## §3 색인 저장소 `steamDB-for-korean-db`

### 3.1 구성

```
scripts/build-index.mjs       Node 20, 의존성 없음. GITHUB_TOKEN 환경변수 필요
scripts/match.mjs             순수 함수(이름 정리·콘솔 판정·검색 결과 채택) + node --test 대상
scripts/match.test.mjs
data/github-patches.json      확장이 읽는 결과
data/overrides.json           수동 고정 {"owner/repo": appid | null}
data/review.md                이름 매칭으로 연결된 것 + 연결 실패 목록
.github/workflows/index.yml   cron 매일 1회 + workflow_dispatch, 변경 시에만 커밋(contents: write)
```

### 3.2 수집과 연결

수집: GitHub GraphQL `search(type: REPOSITORY, first: 100)` 페이지네이션, 검색어 `한글패치`, `korean-patch`, `topic:korean-patch`, `topic:hangul-patch`. 한 쿼리에 `nameWithOwner, owner.login, description, homepageUrl, isFork, url, latestRelease{url}, object(expression:"HEAD:README.md"){...on Blob{text}}`(없으면 `HEAD:README`)를 함께 받는다. 포크 제외. 중복 저장소 합침.

연결 (저장소마다 첫 일치 규칙 하나):
1. `overrides.json` 값(`null`이면 제외).
2. 설명·홈페이지·README에서 `store.steampowered.com/app/(\d+)` 첫 매치 → `match:"link"`.
3. 설명에서 `Steam\s*(\d{3,8})` → `match:"steamid"`.
4. 이름 매칭 → `match:"name"`:
   - 설명에 콘솔명(`PS1|PS2|PS3|PS4|PSP|PSV|GBA|GB|NDS|3DS|SFC|SNES|FC|MD|Dreamcast|DC|Saturn|Wii|Switch|Xbox|N64`, 단어 경계)이 있고 `Steam`이 없으면 건너뜀.
   - 후보 이름: 저장소 이름(`-`/`_`/CamelCase 분리)과 설명의 첫 영문 구간(`|`, `—`, `/`, 한글 이전까지). 제거어: `korean, kor, ko, kr, patch, patcher, kopatch, koreanpatch, hangul, hangle, localization, translation, release, unofficial, steam, 한글패치, 한글, 한국어, 패치`.
   - 후보마다 `https://store.steampowered.com/api/storesearch/?term=…&l=english&cc=us` 상위 결과에 대해 정규화(소문자, 영숫자만) 이름 비교: ①완전 일치가 있으면 그 appid ②없으면 이름에 `soundtrack|ost|demo|dlc|art book|artbook|pack`가 없는 결과 중 후보로 시작하는 것이 정확히 하나일 때만 채택.
5. 실패 → `review.md`의 "연결 실패" 목록.

표시 주소: `latestRelease.url`이 있으면 그것, 없으면 저장소 `url`.

### 3.3 출력 형식 (두 저장소 간 규약)

```json
{
  "_meta": { "generated_at": "2026-11-12T03:00:00Z", "repos": 1234, "matched": 210 },
  "1444480": [
    {
      "repo": "yuiver4/Turing-Complete-Korean-Patch",
      "owner": "yuiver4",
      "url": "https://github.com/yuiver4/Turing-Complete-Korean-Patch/releases/tag/v1.2",
      "desc": "Turing Complete 한글패치 — 2.1.292 비공식 한국어 패치",
      "match": "name"
    }
  ]
}
```
- 키는 문자열 appid, 값은 배열(한 게임에 여러 저장소). `match` ∈ `override|link|steamid|name`.
- 배열은 `repo` 오름차순, 키는 숫자 오름차순(diff 안정).

### 3.4 요청 수

GraphQL 검색은 쿼리당 100개 → 약 1,300개를 20회 안팎. Steam 스토어 검색은 이름 매칭 대상 저장소마다 후보 최대 2개. Actions 기본 `GITHUB_TOKEN`으로 충분(REST로 저장소별 README·릴리스를 물으면 시간당 1,000회 한도 초과라 GraphQL 사용).

## 실패 처리

- HLTB API 실패/미등록 → `플레이타임` 행 생략.
- KOSTEAM·색인 데이터 조회 실패 → 저장본 사용, 없으면 `한글 여부` 행 생략.
- 색인 Actions 실패 → 기존 `github-patches.json` 유지(커밋 안 함).
- 이름 오매칭 → `review.md` 검토 후 `overrides.json`으로 교정.

## 테스트

- 확장 `parse.test.mjs`: `hltbValue`(17.45→`17.5시간`, 54.22→`54시간`, 0.3→`0.3시간`, 0.02→`0.1시간`, 0/null→`—`), `patchEntries`(실제 `lookup.json` 표본: 유저패치 2출처 `1250`, `official` 유형, 스토브만 있는 게임, GitHub 항목 병합·중복 제거), Steam 한국어 판정 함수(언어표/`rgPayloads` 두 형태).
- 색인 `match.test.mjs`: 이름 정리, 콘솔 판정, 채택 규칙 — 표본 14건(`Crab Champions`→774801, `LaNoire`→110800, `Database Detective`→3950130, `Islets`→1669420(`Islets Defense` 아님), `Zero Parades`→2863680 등), 콘솔 저장소 건너뜀.
- 수동: 두 확장(이 확장 + SteamDB)만 켠 Chrome에서 `/app/1250/`, `/app/292500/`, `/app/1444480/`(GitHub 링크), 스토브 전용 게임, 공식 한국어 게임 확인. 첫 Actions 실행의 `review.md` 검토.

## 배포 절차 (실행 전 사용자 확인)

1. `kjk-l10n-ko/steamDB-for-korean` 공개 저장소 생성 → 현재 로컬 이력 push.
2. `kjk-l10n-ko/steamDB-for-korean-db` 공개 저장소 생성 → 스크립트·워크플로 push → 수동 실행으로 첫 색인 생성.
