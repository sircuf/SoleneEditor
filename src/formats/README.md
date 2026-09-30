# formats

RisuAI 파일 포맷의 파싱(parse)과 직렬화(build)를 담당해요.

- 순수 TS로만 작성해요. UI, 저장소, DOM에 의존하지 않아요.
- 모르는 필드를 버리지 않아요. `build(parse(x))`가 원본과 같아야 해요.
- 동작 기준은 RisuAI 원본 소스예요. 포팅한 코드에는 출처 경로를 주석으로 남겨요.

## 파일

| 파일 | 역할 | 문서 |
|---|---|---|
| `charx.ts` | ZIP, `card.json`, `module.risum`, 그 밖의 항목 보존 | [charx.md](charx.md) |
| `risum.ts` | 모듈 바이너리 포맷 | [risum.md](risum.md) |
| `rpack.ts` | risum 바이트 치환 인코딩 | [rpack.md](rpack.md) |
| `lorebook.ts` | 로어북 JSON | [lorebook.md](lorebook.md) |
| `validate.ts` | 내보내기 전 유효성 검사 | (예정) |

의존 관계: `charx → risum → rpack`, `lorebook`은 단독.
