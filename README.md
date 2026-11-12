# Steam Info Relay

Chrome MV3 확장. `store.steampowered.com/app/*`에서 아래 세 확장이 주입한 DOM을 가로채어
게임 정보 탭(`#glanceMidCtn`, 태그 열 위)에 Steam 기본 행 형식으로 다시 표시하고, 원본 블록은 숨긴다. 링크는 파란색.

- **한글 여부:** KOSTEAM 배너 → `한글 패치 (이름) | 한글 패치 (이름)`. 이름은 `X님` / `제작자 : X` / `패치 - X` 휴리스틱, 실패 시 사이트명. 한패넷·퀘이사존 큐레이터 링크는 그 페이지 안의 실제 패치 링크로 바꾸고(한패넷은 확장 background에서 `hanpe.net`만 조회 — 그래서 `hanpe.net` 호스트 권한 필요), 같은 링크가 여러 번 나오면 하나만 표시한다. `공식 한국어`/`공식(추가정보 존재)`는 SteamDB 평가 녹색의 `공식 한글화`, 패치 링크가 있으면 ` | `로 이어 붙인다. 그 밖에 링크 없는 유형은 유형 라벨만.
- **플레이타임:** Steam HLTB의 `#hltb-glance` → `메인 / 메인+서브 / 완전 정복` 3줄, 값은 `25.5시간` 형식(분도 소수 시간), 탭 간격 정렬.
- **가격 (현재/최저):** 한 줄 `₩ 11,000 (-50%) | ₩ 5,500 (-75%)`. 현재가와 최저가가 같아도 둘 다 표시. 할인율 괄호는 할인이 있을 때만(0%는 생략; 최저가는 SteamDB가 안 주면 정가 대비 계산), 최저 값은 SteamDB 앱 페이지 링크. 무료 게임은 생략.
- **출시/업데이트 일자:** Steam 출시일 행과 SteamDB 최근 업데이트 행을 하나로 합쳐 원래 출시일 자리에 `09.05.14 | 25.03.14 (8개월 전)` 형식으로 표시. 업데이트 날짜는 SteamDB 원본처럼 `/patchnotes/` 링크(1년 넘으면 `(…전)` 빨강), 위아래 여백은 Steam 원래 날짜 행과 같다.

## 필요한 확장

이 확장은 아래 세 확장이 페이지에 그린 내용을 읽어 다시 표시한다. 세 확장이 설치·활성화되어 있어야 한다.

| 확장 | 제공 정보 | 설치 |
|---|---|---|
| Steam HLTB | 플레이타임 | [Chrome 웹 스토어](https://chromewebstore.google.com/detail/steam-hltb/cnfpnjgnkmonaeincdllnfeopmnngiin) |
| SteamDB | 최저가, 최근 업데이트 날짜 | [Chrome 웹 스토어](https://chromewebstore.google.com/detail/steamdb/kdbmhfkmnlmbkgbabkdealhhbfhlmmon) |
| KOSTEAM | 한글패치 정보 | [Chrome 웹 스토어](https://chromewebstore.google.com/detail/kosteam/cbcganplchikpgchgppklcblpjibhnnc) |

소스를 읽지 못하면 해당 행만 생략되며, 원본 블록은 여전히 숨겨진다.

설치: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드" → 이 폴더.

테스트: `node --test parse.test.mjs`
