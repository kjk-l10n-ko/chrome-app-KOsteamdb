# Steam Info Relay

Chrome MV3 확장. `store.steampowered.com/app/*`에서 아래 세 확장이 주입한 DOM을 가로채어
게임 정보 탭(`#glanceMidCtn`)에 Steam 기본 행 형식으로 다시 표시하고, 원본 블록은 숨긴다.

- **한글 패치:** KOSTEAM 배너 → `이름(링크) | 이름(링크)`. 이름은 `X님` / `제작자 : X` / `패치 - X` 휴리스틱, 실패 시 사이트명. 링크 없는 유형(공식 한국어 등)은 유형 라벨만.
- **HowLongToBeat:** Steam HLTB의 `#hltb-glance` 3줄 → `메인 스토리 / 메인+서브 / 완전 정복`.
- **가격:** 구매 박스 현재가(할인율) + SteamDB 최저가(할인율, SteamDB 앱 페이지 링크). 무료 게임은 생략.

**전제:** 세 확장(Steam HLTB, SteamDB, KOSTEAM)이 설치·활성화되어 있어야 정보가 표시된다.
소스를 읽지 못하면 해당 행만 생략되며, 원본 블록은 여전히 숨겨진다.

설치: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드" → 이 폴더.

테스트: `node --test parse.test.mjs`
