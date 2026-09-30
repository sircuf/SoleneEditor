# 아키텍처

## 레이어

```
앱 연결 (src/main.ts, src/App.svelte)
  │ 저장소 → 서비스 → 스토어를 만들고 initialize 후 EditorApp을 띄워요
UI (src/components, src/schemas)
  │ EditorStores 계약만 사용 (읽기 상태 + 명령)
스토어 (src/stores): workspace, ui, status, settings, snapshots, draft
  │
서비스 (src/services): Import / Autosave / Snapshot / Export + 브라우저 어댑터
  │
포맷 (src/formats, 순수 TS): charx, risum, rpack, lorebook, validate
  │
저장 (src/storage): IndexedDB (workspace, snapshots, preserved, draft) + localStorage (settings)
```

- 레이어 사이의 타입과 진입점은 모두 `src/contracts/`에 있어요([README](../src/contracts/README.md)).
- 의존은 위에서 아래로만 흘러요. 포맷 레이어는 다른 레이어에 의존하지 않아요.
- 각 레이어의 공개 진입점은 `formats`, `createStorage`, `createServices`, `createEditorStores`예요. 이 네 개를 조립하는 건 `src/main.ts`뿐이에요.

## 폴더

| 경로 | 역할 |
|---|---|
| `src/contracts/` | 레이어 사이의 타입·인터페이스 (구현 없음) |
| `src/formats/` | 파일 포맷 파싱·직렬화, 검증 |
| `src/storage/` | IndexedDB, localStorage 래퍼 (막히면 메모리로 대체) |
| `src/services/` | 가져오기, 내보내기, 자동 저장, 스냅샷, 브라우저 어댑터 |
| `src/stores/` | 앱 상태와 UI 명령 |
| `src/components/` | UI 컴포넌트와 디자인 토큰(`theme.css`) |
| `src/schemas/` | 탭별 폼 필드 정의 |
| `src/dev/` | 목업 스토어와 UI 미리보기 (운영 빌드 제외) |
| `tests/` | 포맷 테스트, 통합 테스트(`integration/`), 샘플(`fixtures/synthetic`, `fixtures/real`) |

## 데이터 모델

자세한 타입은 `src/contracts/storage.ts`, `format.ts`, `document.ts`에 있어요.

- **workspace** (단일): `{ fileName, kind, doc, dirty, lastExportedAt, updatedAt }`
  - `doc`은 편집 가능한 JSON뿐이에요. charx는 `card`와 `module`(없으면 null), risum은 모듈 envelope, 로어북은 루트 객체 전체예요.
- **preserved**: 포맷 레이어만 해석하는 바이너리 보관함이에요. 에셋, 그 밖의 ZIP 항목, JPEG 앞부분, risum 에셋 블록이 들어 있어요. 가져올 때 한 번 저장하고 내보낼 때 그대로 넣어요.
- **snapshots**: `{ id, time, label, pinned, reason, doc, size, contentHash }` — 텍스트(doc)만 담아요.
- **draft**: JSON 문법 오류가 난 편집 중인 텍스트 (항목 하나)
- **settings** (localStorage): 스냅샷 간격(기본 5분), 용량 한도(기본 100MB), 테마, 폼/JSON 모드

`dirty`는 마지막 내보내기 이후 변경이 있다는 뜻이에요. 자동 저장으로는 해제되지 않고, 내보내기에 성공해야 해제돼요.

## 주요 흐름

**가져오기**: 파일 선택 → (기존 작업이 있으면 경고) → 파싱 → 성공했을 때만 기존 데이터를 한 트랜잭션으로 교체 → "원본" 스냅샷(고정)

**편집**: 입력 → 300ms 디바운스(한글 조합 중에는 보류) → 스토어 갱신, dirty = true → 1초 디바운스 자동 저장 → n분마다 변경이 있으면 스냅샷

**내보내기**: 남은 입력 반영 → 자동 저장 flush → 유효성 검사(오류면 중단, 경고는 표시) → build(JSON + 보관 바이너리) → 다운로드 → "내보낸 버전" 스냅샷(고정) → dirty = false

**복원**: 현재 상태를 "복원 전" 스냅샷으로 저장 → workspace 교체 → dirty = true

**스냅샷 정리**: 총 용량이 한도를 넘으면 오래된 것부터 지워요. 고정 스냅샷(원본, 수동, 내보낸 버전)은 자동으로 지우지 않아요.
