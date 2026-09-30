# 아키텍처

## 레이어

```
UI (Svelte components)
  │ 읽기 / 편집 명령
상태 (Svelte stores): workspace, ui, status
  │
서비스: Import / Autosave / Snapshot / Export
  │
포맷 (순수 TS): charx, risum, lorebook, rpack, validate
  │
저장: IndexedDB (workspace, snapshots, assets, draft), localStorage (settings)
```

의존 방향은 위에서 아래로만 흘러요. 포맷 레이어는 다른 어떤 레이어에도 의존하지 않아요.

## 폴더

| 경로 | 역할 |
|---|---|
| `src/formats/` | 파일 포맷 파싱과 직렬화 |
| `src/storage/` | IndexedDB, localStorage 래퍼 |
| `src/services/` | 가져오기, 내보내기, 자동 저장, 스냅샷 |
| `src/stores/` | 앱 상태 |
| `src/components/` | UI 컴포넌트 |
| `src/schemas/` | 탭별 폼 필드 정의 |
| `tests/` | 왕복 테스트, 샘플 파일 |

## 데이터 모델

- **workspace** (단일): `{ fileName, type, data, dirty, lastExportedAt }`
- **snapshots**: `{ id, time, label, pinned, json }` — 텍스트만 담아요
- **assets**: 가져올 때의 원본 에셋과 기타 파일 그대로
- **draft**: JSON 문법 오류 중인 임시 텍스트
- **settings** (localStorage): 스냅샷 간격, 용량 한도, 테마, 폼/JSON 모드

`dirty`는 마지막 내보내기 이후 변경이 있다는 뜻이에요. 자동 저장으로는 해제되지 않고, 내보내기에 성공해야 해제돼요.

## 주요 흐름

**가져오기**: 파일 선택 → (기존 작업이 있으면 경고) → 파싱 → 성공했을 때만 기존 데이터 삭제 → 새 workspace, assets 저장 → "원본" 스냅샷(고정)

**편집**: 입력 → workspace 갱신, dirty = true → 1초 디바운스 자동 저장 → n분마다 변경이 있으면 스냅샷

**내보내기**: 유효성 검사 → build(JSON + 보관된 에셋) → 다운로드 → "내보낸 버전" 스냅샷(고정) → dirty = false

**복원**: 현재 상태를 "복원 전" 스냅샷으로 저장 → workspace 교체 → dirty = true
