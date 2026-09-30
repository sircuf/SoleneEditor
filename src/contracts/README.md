# contracts

구현 전에 레이어 사이의 데이터와 호출 규칙을 고정해요. 런타임 구현은 각 레이어에 두고, 여기에는 순수 TypeScript 타입·인터페이스와 작은 오류 클래스만 둬요. `$contracts` 또는 `$contracts/document`처럼 가져와요. Vite, Vitest, TypeScript가 같은 별칭을 사용해요.

**구현 에이전트에게 contracts는 읽기 전용이에요. 변경 요청은 감독자에게 보내요.** 다른 에이전트가 기존 계약으로 동시에 구현하므로 필드나 메서드를 임의로 바꾸면 안 돼요.

| 파일 | 역할 |
|---|---|
| `document.ts` | JSON 값, 알 수 없는 필드 보존, 문서 종류, 항목 주소와 탭 규칙을 정의해요 |
| `format.ts` | 동기 codec, 판별 순서, 보존 payload, 포맷 오류를 정의해요 |
| `validate.ts` | 내보내기 오류·경고와 JSON Pointer 경로를 정의해요 |
| `storage.ts` | workspace·스냅샷·draft·설정 레코드와 비동기 저장 인터페이스를 정의해요 |
| `services.ts` | 가져오기·내보내기·스냅샷·자동 저장의 순서와 실패 규칙을 정의해요 |
| `stores.ts` | UI가 읽는 상태와 호출하는 명령만 공개해요 |
| `wiring.ts` | 레이어의 고정 공개 진입점과 주입할 의존성·브라우저 어댑터를 정의해요 |
| `index.ts` | 계약의 공개 진입점이에요 |

## 의존 방향

UI → stores → services → formats / storage 순서로 의존해요. formats와 storage는 서로 의존하지 않고 계약 타입만 공유해요. formats는 UI·서비스·저장소·브라우저 전역 상태를 사용하지 않아요. 계약 파일의 의존도 `document` → `format` / `validate` → `storage` → `services` → `stores` 순서이고, 뒤쪽 파일이 앞쪽 파일의 타입을 가져와요. 런타임 레이어에 대한 import는 없어요.

컴포넌트는 구현 stores의 `EditorStores` 한 객체만 사용해요. 타입은 contracts에서 가져올 수 있지만 다른 레이어의 구현이나 writable store에 접근하면 안 돼요. `ReadableState`는 Svelte readable과 구조가 같고, 노출한 문서는 깊은 읽기 전용이에요. 레이어의 생성 방식과 주입할 의존성은 `wiring.ts` 계약을 따라요.

## 고정 공개 진입점과 의존성 주입

각 레이어는 다음 공개 진입점을 반드시 내보내요. 구현 에이전트는 다른 레이어의 구현을 가져오지 않고 contracts의 타입과 주입받은 객체만으로 독립적으로 빌드해요.

| 공개 진입점 | 필수 export |
|---|---|
| `src/formats/index.ts` | `export const formats: FormatsApi` |
| `src/storage/index.ts` | `export const createStorage: CreateStorage` |
| `src/services/index.ts` | `export const createServices: CreateServices` |
| `src/stores/index.ts` | `export const createEditorStores: CreateEditorStores` |

`formats`는 registry, charx → risum → lorebook 순서의 `detectKind`, `getAvailableTabs`, `validate`를 제공해요. `getAvailableTabs` 구현은 formats 레이어에 두고, `validate` 구현은 `src/formats/validate.ts`에 둬요.

`createStorage()`는 초기화를 마친 Storage를 비동기로 반환해요. `createServices(deps)`는 Storage·FormatsApi·다운로드 어댑터·현재 시각·새 ID·SHA-256 어댑터를 받아 네 서비스를 동기로 구성해요. `createEditorStores(deps)`는 Storage·Services·FormatsApi·File 읽기 어댑터를 받아 EditorStores를 동기로 구성해요. 시각은 Unix 밀리초이고 SHA-256 어댑터는 소문자 hex를 반환해요.

`main.ts`에서 각 진입점과 브라우저 어댑터를 연결하는 App wiring은 **후속 통합 단계의 작업**이에요. 어떤 레이어 구현 에이전트도 이 조립을 맡거나 현재 placeholder를 바꾸지 않아요.

## 편집 문서와 보존 데이터

`EditableDocument`는 앱의 래퍼와 원본 JSON으로 구성해요. 모든 원본 JSON 객체는 `JsonObject`를 확장하거나 그 값으로 보관해서 알 수 없는 키를 유지해요. optional 필드는 가져올 때 없었다면 계속 없게 두고, 사용자가 편집할 때만 만들어요. JSON 값에는 유한한 수만 허용하고, `undefined`는 필드 부재를 표현하는 타입일 뿐 실제 데이터에 넣지 않아요. 스냅샷에 바이너리나 workspace 메타데이터를 넣지 않아요.

| 종류 | 원본 JSON 위치 | 로어북 편집 위치 |
|---|---|---|
| module 있는 charx | `card`와 `module`의 risum JSON envelope | `module.module.lorebook` |
| module 없는 charx | `card`, `module = null` | `card.data.character_book.entries` |
| risum | `module`의 risum JSON envelope | `module.module.lorebook` |
| lorebook | 파일 전체 JSON인 `book` | `book.data` |

module은 `{ type: 'risuModule', module: RisuModule, ... }` 전체 envelope예요. 이름이 한 번 더 중첩되지만 risum 본문 최상위의 알 수 없는 필드까지 스냅샷과 왕복에 남겨요. standalone 로어북도 `data` 배열만 추출하지 않고 전체 root를 남겨요.

`PreservedPayload`는 IndexedDB structured clone으로 저장할 수 있는 이름·바이트 목록과 포맷 전용 JSON 메타데이터예요. brand는 타입에만 존재하고 실제 Symbol 프로퍼티를 만들지 않아요. **formats만 payload를 만들고, brand를 부여하고, 내부를 읽어요.** 다른 레이어는 통째로 전달하거나 저장해요. 바이너리를 복제한 스냅샷을 만들지 않아요.

charx의 기타 ZIP 항목, JPEG 접두부, risum 에셋 블록을 원래 바이트로 보관해요. 이름·순서·중첩 위치·에셋 참조와 블록의 짝은 formats의 메타데이터로 남겨요. 순수 JSON 에셋 참조는 편집 문서에 유지하되 UI와 JSON 편집 모두 참조 변경·삭제·추가·순서 변경을 막아요. 불일치는 build에서도 `asset-reference-changed`로 거부해요.

charx에서 module이 있으면 내보내기 결과의 `character_book.entries`를 module 로어북에서 다시 생성해요. 책 설정과 extensions, 충돌하지 않는 기존 항목의 알 수 없는 필드는 보존해요. 원본 항목과의 대응 정보는 formats가 payload 메타데이터에 보관해요. 의미가 겹치는 항목 내용은 module을 우선하므로 원래 두 사본이 달랐다면 그 차이는 내보내기에서 정리돼요. 변환 로직은 후속 구현에서 RisuAI 원본을 기준으로 정해요. module이 없으면 CCv3 항목을 그대로 편집하고 module을 새로 만들지 않아요. build는 편집 문서를 직접 바꾸지 않아요.

## 탭과 항목 주소

| 문서 | 탭 순서 |
|---|---|
| module 있는 charx | card → module → lorebook → regex → trigger |
| module 없는 charx | card → lorebook |
| risum | module → lorebook → regex → trigger |
| lorebook | lorebook |

card와 module은 단일 객체라 index가 없어요. card 편집 대상은 `card.data`, module 편집 대상은 envelope의 `module`이에요. 목록 주소에는 0부터 시작하는 index가 있어요. lorebook 주소에는 `format: 'risu'` 또는 `'character-book'`도 명시해요. 전자는 `LoreBookEntry`, 후자는 `CharacterBookEntry`를 사용하고 서로 자동 변환하지 않아요. regex와 trigger는 각각 현재 module의 해당 배열이에요. 배열이 없어도 탭을 표시하지만 최초 추가 전까지 원본 필드를 만들지 않아요.

`updateItem`은 항목 전체 교체예요. 폼은 현재 값의 알 수 없는 키를 보존해서 전달해요. `updateCard`는 `card.data`의 얕은 patch이고, `setCardField`는 점 경로가 아닌 직접 키 하나를 바꿔요. patch의 `undefined`는 무시해요. 일반 항목 편집으로 책 설정이나 카드·module envelope를 없애면 안 돼요. 에셋 관련 필드는 읽기 전용이에요.

JSON 편집은 항목 단위이고 `updateJson`으로 전달해요. 잘못된 문법이나 해당 항목 구조와 맞지 않는 값은 draft에만 저장하고 마지막 유효 문서를 그대로 둬요. draft가 있으면 항목·탭 이동, 폼 전환, 내보내기를 막아요. 가져오기 확인의 continue, 명시적인 draft 폐기, 확인한 스냅샷 복원으로만 이를 버릴 수 있어요. draft를 만드는 동안 원본 문서의 dirty나 스냅샷 내용을 바꾸지 않아요.

## 서비스와 저장 순서

가져오기는 기존 workspace가 있으면 dirty와 관계없이 확인해요. prepare에서 판별·파싱이 모두 성공한 뒤에만 commit해요. commit 전 오래된 autosave와 interval 작업을 멈추고 완료를 기다려요. `replaceWorkspace(doc, preserved, replacement)`는 workspace 메타데이터와 원본 스냅샷도 받아요. 하나의 트랜잭션에서 기존 workspace·스냅샷·payload·draft를 비우고 새 workspace·payload·고정 원본 스냅샷을 써요. 실패하면 이전 전체 상태를 유지해요. 브라우저 저장소가 막힌 경우에도 일관된 메모리 저장소로 편집을 계속할 수 있어요.

내보내기는 autosave를 flush한 뒤 오류 없는 검증 → build → 다운로드 시작 → 고정 export 스냅샷 → dirty 해제 순서예요. 경고는 내보내기를 막지 않아요. 브라우저가 확인할 수 있는 성공은 다운로드 시작까지예요. 사용자 디스크에 저장 완료됐다는 보장은 할 수 없어요. 오류가 나면 dirty를 해제하지 않아요. `export-then-continue`도 이 흐름이 성공해야 가져오기를 계속해요.

자동 저장은 1초 debounce예요. 새 요청이 이전 예약을 대체하면 이전 Promise는 null로 끝나요. 실제 저장 완료 시각을 status.lastSavedAt으로 반영하고, 새 편집이 생겼다면 오래된 AutosaveResult로 현재 문서를 덮어쓰지 않아요. dirty는 마지막 내보내기 이후 편집 여부이므로 자동 저장으로 해제하지 않아요.

스냅샷은 객체 키를 UTF-16 코드 단위 순으로 재귀 정렬하고 배열 순서를 유지한 compact JSON을 UTF-8로 인코딩해요. SHA-256 소문자 hex를 contentHash로, 그 바이트 길이를 size로 사용해요. interval만 최신 스냅샷과 hash가 같으면 건너뛰어요. original·manual·export는 고정이고 나머지는 비고정이에요. 총용량에는 고정 스냅샷도 포함하고 time, id 순으로 가장 오래된 비고정 항목부터 지워요. 고정 항목만으로 한도를 넘으면 더 지우지 않아요. 용량 설정은 이름이 MB지만 1024² 바이트 단위예요.

복원은 현재 문서의 before-restore 스냅샷 저장이 먼저 성공해야 진행해요. 기존 payload·파일명·lastExportedAt은 유지하고 문서와 updatedAt을 바꾸며 dirty를 켜요. 가져오기 때 스냅샷을 모두 교체하므로 복원 대상은 항상 현재 workspace에 속해요. 가져오기·내보내기·복원 동안에는 다른 편집을 막고, background 쓰기를 직렬화해서 이전 작업이 새 상태를 덮어쓰지 않게 해요. interval 실패는 등록한 onError로 전달해요.

설정 기본값은 interval 5분, 한도 100 MiB, system 테마, form 모드예요. interval 0은 꺼짐이고 음수는 거부해요. 용량은 양수여야 해요. 숫자 설정은 유한한 값만 받아요. 설정 변경은 interval을 다시 시작하고 즉시 보존 한도를 적용해요.
