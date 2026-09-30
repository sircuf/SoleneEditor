# 진행 상황

새 세션은 이 문서부터 읽어요. 작업이 한 단계 끝날 때마다 갱신해요. (마지막 갱신: 2026-09-30)

## 지금 상태

**MVP 기능 구현과 통합 완료.** `main`에서 `npm run check`, `npm test`(98개 통과), `npm run build`가 모두 통과해요.

- 세 포맷(`.charx`, `.risum`, 로어북 `.json`) 가져오기 → 폼/JSON 편집 → 자동 저장·스냅샷 → 내보내기가 실제 앱에서 동작해요.
- 호환성은 양방향으로 확인했어요.
  - RisuAI가 만든 실제 파일(`tests/fixtures/real/`)을 왕복 테스트해요.
  - SoleneEditor로 편집해 내보낸 파일을 RisuAI의 `readModule`·`importCharacterProcess`가 정상적으로 읽는 것을 확인했어요 (2026-09-30, 수동 확인).
- UI 디자인은 새로 짠 "종이와 잉크 / 달빛 잉크" 테마예요 ([src/components/README.md](src/components/README.md)).

## 배포 상태

- 저장소: https://github.com/sircuf/SoleneEditor (공개, `main`만 push됨)
- **GitHub Pages는 내려 둔 상태예요.** 완성할 때까지 localhost에서만 테스트해요.
  - "Deploy GitHub Pages" 워크플로우는 `disabled_manually` 상태예요. push해도 배포되지 않아요.
  - 사용자가 완성이라고 하기 전에는 다시 켜지 않아요. 켜는 방법은 [docs/WORKFLOW.md](docs/WORKFLOW.md#배포)에 있어요.

## 다음 후보 작업

사용자와 우선순위를 정한 뒤 진행해요. 목록은 [docs/OVERVIEW.md](docs/OVERVIEW.md)의 "MVP 이후"를 기준으로 해요.

1. 실제 사용 중인 RisuAI 파일(에셋이 많은 카드 등)로 추가 확인
2. 검색·치환(정규식 포함), CBS 하이라이팅, 로어북 정렬·필터
3. 원본 파일에 덮어쓰기 (File System Access API)
4. 스냅샷 비교(diff) 화면
5. 모바일 전용 레이아웃, 탭 전체 JSON 보기
6. 최신 RisuAI의 `.module.charx` 모듈 형식 지원 검토 ([src/formats/risum.md](src/formats/risum.md))
7. 배포 워크플로우의 액션 버전 올리기 (Node.js 20 폐지 경고: `checkout@v4`, `deploy-pages@v4` 등)

## 알려진 사항

- 카드 JSON의 `character_version`에 RisuAI가 `"undefined"` 문자열을 넣는 경우가 있어요. 그대로 보존해요.
- 합성 샘플(`tests/fixtures/synthetic/`)은 우리가 이해한 형식으로 만든 파일이에요. 호환성의 최종 기준은 `tests/fixtures/real/`이에요.
- 작업용 브랜치 `sol1/formats`, `sol2/storage`, `sol3/ui`는 로컬에만 있고 모두 `main`에 병합됐어요.

## 협업 체계 (다중 에이전트로 작업할 때)

역할, Codex 세션 운용, git 분담, 검증 절차는 [docs/WORKFLOW.md](docs/WORKFLOW.md)에 있어요. 지금까지 쓴 Codex 세션은 이래요. 세션을 다시 쓸지는 사용자에게 확인해요.

| 이름 | 역할 | 세션 ID |
|---|---|---|
| 솔1호 | 포맷 레이어 | `01a0f14b-86a8-75a2-a3d5-651ad4d967e4` |
| 솔2호 | 저장·서비스·스토어 | `01a0f14c-fc77-7440-9ded-bcc9556ac8a2` |
| 솔3호 | UI (중간에 감독자가 인수) | `01a0f14d-8047-7fc1-9a05-4c0b90f916e8` |
| 아스트라쨩 | 통합 | `01a0f1af-11f2-7920-9e01-c67d3eaec883` |
