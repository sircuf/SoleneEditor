# AGENTS.md

SoleneEditor: RisuAI의 `.charx`, `.risum`, 로어북 `.json`을 텍스트 기반으로 편집하는 웹 앱이에요.
정적 사이트(GitHub Pages 예정)이고, 모든 처리는 브라우저 안에서만 해요.

## 먼저 읽을 문서

1. [STATUS.md](STATUS.md): 지금 상태, 배포 상태, 다음 후보 작업. **새 세션은 여기부터 읽어요.**
2. [docs/OVERVIEW.md](docs/OVERVIEW.md): 목표, 원칙, MVP 범위
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): 레이어 구조, 데이터 모델, 흐름
4. [docs/DECISIONS.md](docs/DECISIONS.md): 확정된 결정과 이유
5. [docs/WORKFLOW.md](docs/WORKFLOW.md): 역할 분담, Codex 운용, 검증, 배포 절차
6. [src/contracts/README.md](src/contracts/README.md): 레이어 사이의 계약

## 스택

Vite, Svelte 5, TypeScript, CodeMirror 6, fflate, idb(IndexedDB), Vitest. PWA는 쓰지 않아요.

## 명령

```bash
npm run dev      # 로컬 실행 (실제 앱: /, UI 미리보기: /src/dev/preview.html)
npm run check    # svelte-check + tsc
npm test         # 전체 테스트 (포맷, 레이어별, 통합, 실제 RisuAI 샘플)
npm run build    # dist/ 정적 빌드
```

커밋 전에는 세 가지 검사를 모두 통과시켜요.

## 지금 지켜야 할 것

- **배포하지 않아요.** 완성할 때까지 localhost에서만 테스트해요. Pages와 배포 워크플로우를 사용자 허락 없이 다시 켜지 않아요.
- 커밋 이메일은 저장소 로컬에 설정된 GitHub noreply 주소를 써요. 개인 이메일로 커밋하지 않아요.
- 외부에 공개하거나 되돌리기 어려운 작업(push 외의 저장소 설정 변경, 삭제 등)은 먼저 사용자에게 확인해요.

## 문서 규칙

- `docs/`에는 프로젝트 전반에 걸친, 거의 바뀌지 않는 중심 문서만 둬요. 자주 바뀌는 진행 상황은 루트의 `STATUS.md`에 둬요.
- 그 밖의 문서는 코드 가까이에 둬요.
  - 폴더 역할: 해당 폴더의 `README.md`
  - 파일 설명: 같은 폴더에 같은 이름의 `.md` (예: `src/formats/charx.ts` ↔ `src/formats/charx.md`)
- 코드를 바꿔서 동작이나 구조가 달라지면 가까이 있는 문서도 함께 고쳐요. 작업 단계가 끝나면 `STATUS.md`를 갱신해요.
- 문서와 UI 문구는 한국어 해요체로 써요.

## 코드 규칙

- 레이어 사이는 `src/contracts/`의 계약으로만 연결해요. 계약을 바꿀 때는 모든 레이어에 미치는 영향을 함께 확인해요.
- 포맷 레이어(`src/formats/`)는 UI, 저장소, 브라우저 전역 상태에 의존하지 않는 순수 TS로 작성해요.
- 파서는 모르는 필드를 절대 버리지 않아요. `parse → build` 왕복 결과가 원본과 같아야 해요.
- 파일 포맷 동작은 RisuAI 원본 소스(`kwaroran/RisuAI`)를 기준으로 해요. 추측으로 구현하지 않아요.
- 에셋은 편집하지 않아요. 가져올 때 원본 그대로 보관하고 내보낼 때 그대로 넣어요.
- UI 컴포넌트는 `EditorStores` 계약만 사용하고, 입력은 디바운스와 한글 조합(IME)을 지켜요([src/components/README.md](src/components/README.md)).

## 라이선스

AGPL-3.0. RisuAI(GPL-3.0)와 rpack(AGPL-3.0) 코드를 포팅할 때는 출처 파일 경로를 주석으로 남겨요.
