# formats

RisuAI 파일 포맷의 파싱(parse)과 직렬화(build)를 담당해요.

- 순수 TS로만 작성해요. UI, 저장소, DOM에 의존하지 않아요.
- 모르는 JSON 필드를 버리지 않아요. 왕복은 JSON 의미와 보존 바이너리 바이트로 비교해요. charx의 module 로어북에서 파생하는 `character_book.entries`는 내보낼 때 동기화해요.
- 동작 기준은 RisuAI 원본 소스예요. 포팅한 코드에는 출처 경로를 주석으로 남겨요.

## 파일

| 파일 | 역할 | 문서 |
|---|---|---|
| `charx.ts` | ZIP, `card.json`, `module.risum`, 그 밖의 항목 보존 | [charx.md](charx.md) |
| `risum.ts` | 모듈 바이너리 포맷 | [risum.md](risum.md) |
| `rpack.ts` | risum 바이트 치환 인코딩 | [rpack.md](rpack.md) |
| `lorebook.ts` | 로어북 JSON | [lorebook.md](lorebook.md) |
| `validate.ts` | 내보내기 전 유효성 검사 | [validate.md](validate.md) |
| `shared.ts` | JSON·오류·보존 payload 내부 유틸리티 | [shared.md](shared.md) |
| `index.ts` | `formats: FormatsApi`, 파일 판별, 탭 목록 | [index.md](index.md) |

의존 관계: `charx → risum → rpack`, `lorebook`은 단독.

## 공개 API

`src/formats/index.ts`의 `formats`를 사용해요. registry에는 `charx`, `risum`, `lorebook` codec이 있어요. `detectKind`는 이 순서로 후보를 찾고 없으면 null을 반환해요. 실제 지원 여부와 구조 검사는 각 codec의 parse에서 결정해요. parse/build는 모두 동기이고 FormatError로 실패를 알리며 입력을 바꾸지 않아요.

가져오기와 내보내기 검사를 분리해요. parse는 컨테이너·UTF-8·JSON과 편집에 필요한 객체·목록 뼈대만 검사해요. scalar 타입 불일치, optional에 가까운 필드 부재, 잘못된 spec/type은 원본 그대로 가져온 뒤 `validate`에서 알려요. 목록 필드가 있으면 배열이어야 하고 편집 항목은 객체여야 해요. 없는 목록은 새로 만들지 않아요. build는 validate의 오류가 있으면 중단하지만 경고만 있으면 원본 값을 유지해요. 자세한 오류·경고 기준과 RisuAI 근거는 [validate.md](validate.md)에 있어요.

`getAvailableTabs`는 formats에서 구현하고, `validate`는 `validate.ts`에서 구현해요. 브라우저·저장소·서비스를 가져오지 않고 `$contracts`의 승인된 타입만 사용해요. `PreservedPayload` 내부 구조는 이 레이어만 다뤄요. 다른 레이어는 저장하거나 그대로 전달해요.
