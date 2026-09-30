# AGENTS.md

SoleneEditor: RisuAI의 `.charx`, `.risum`, 로어북 `.json`을 텍스트 기반으로 편집하는 웹 앱이에요.
GitHub Pages로 배포하는 정적 사이트이고, 모든 처리는 브라우저 안에서만 해요.

## 먼저 읽을 문서

- `docs/OVERVIEW.md`: 목표, 범위, MVP
- `docs/ARCHITECTURE.md`: 레이어 구조와 데이터 흐름
- `docs/DECISIONS.md`: 확정된 결정과 이유

## 스택

Vite, Svelte 5, TypeScript, CodeMirror 6, fflate, IndexedDB. PWA는 쓰지 않아요.

## 문서 규칙

- `docs/`에는 프로젝트 전반에 걸친, 거의 바뀌지 않는 중심 문서만 둬요.
- 그 밖의 문서는 코드 가까이에 둬요.
  - 폴더 역할: 해당 폴더의 `README.md`
  - 파일 설명: 같은 폴더에 같은 이름의 `.md` (예: `src/formats/charx.ts` ↔ `src/formats/charx.md`)
- 코드를 바꿔서 동작이나 구조가 달라지면 가까이 있는 문서도 함께 고쳐요.

## 코드 규칙

- 포맷 레이어(`src/formats/`)는 UI, 저장소, 브라우저 전역 상태에 의존하지 않는 순수 TS로 작성해요.
- 파서는 모르는 필드를 절대 버리지 않아요. `parse → build` 왕복 결과가 원본과 같아야 해요.
- 파일 포맷 동작은 RisuAI 원본 소스(`kwaroran/RisuAI`)를 기준으로 해요. 추측으로 구현하지 않아요.
- 에셋은 편집하지 않아요. 가져올 때 원본 그대로 보관하고 내보낼 때 그대로 넣어요.

## 라이선스

AGPL-3.0. RisuAI(GPL-3.0)와 rpack(AGPL-3.0) 코드를 포팅할 때는 출처 파일 경로를 주석으로 남겨요.
