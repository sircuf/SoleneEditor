# risum

기준: `kwaroran/RisuAI` main @ `f9728b1` (2026-09-29) — `src/ts/process/modules.ts` (`readModule`, `exportModuleLegacy`)

## 바이트 구조

```
u8   111              매직 넘버
u8   0                버전
u32le mainLen
u8[mainLen]           rpack(JSON 문자열, UTF-8)
반복:
  u8   1              에셋 표시
  u32le len
  u8[len]             rpack(에셋 바이너리)
u8   0                파일 끝
```

본문 JSON:
```json
{ "module": RisuModule, "type": "risuModule" }
```
RisuAI는 `JSON.stringify(x, null, 2)`로 써요.

## RisuModule

```ts
interface RisuModule {
  name: string
  description: string
  lorebook?: loreBook[]        // lorebook.md 참고
  regex?: customscript[]
  cjs?: string
  trigger?: triggerscript[]
  id: string
  lowLevelAccess?: boolean
  hideIcon?: boolean
  backgroundEmbedding?: string
  assets?: [name: string, data: string, ext: string][]
  namespace?: string
  customModuleToggle?: string
  mcp?: { url: string }
  icon?: string
}

interface customscript {       // 정규식
  comment: string; in: string; out: string; type: string
  flag?: string; ableFlag?: boolean
}

interface triggerscript {
  comment: string
  type: 'start'|'manual'|'output'|'input'|'display'|'request'
  conditions: triggerCondition[]
  effect: triggerEffect[]      // 종류가 매우 많음. MVP에서는 JSON으로만 편집
  lowLevelAccess?: boolean
}
```

## 에셋

- `module.assets[i]`와 i번째 에셋 블록이 **순서로** 짝지어져요.
- 파일 안에서 `assets[i][1]`(데이터 경로)은 빈 문자열이에요. 실제 데이터는 에셋 블록에 있어요.
- RisuAI는 내보낼 때 이미지를 `compressImage`로 재압축해요. 우리는 에셋을 편집하지 않으니 **블록 바이트를 그대로 보관했다가 그대로 다시 써요.**

## 가져오기 시 RisuAI 동작 (참고)

- 가져올 때 `module.id`를 새 UUID로 바꿔요. 우리 편집기는 **id를 바꾸지 않아요.**
- `lowLevelAccess`가 켜진 모듈은 가져올 때 경고해요.

## 참고: 최신 모듈 내보내기

최신 RisuAI의 `exportModule`은 모듈을 `<이름>.module.charx`(캐릭터로 변환한 charx)로 내보내고,
`.risum`은 `exportModuleLegacy`로 남아 있어요. 가져오기는 두 형식 모두 지원해요.
`.module.charx` 지원 여부는 MVP 이후에 검토해요.

## 왕복 조건

JSON 본문은 우리가 다시 직렬화하니 바이트가 같을 필요는 없어요. 비교 기준은
**파싱한 객체가 같고, 에셋 블록 바이트가 같은 것**이에요.

## 구현 API와 오류

`risum`은 `FormatCodec<'risum'>`이에요. detect는 `.risum` 확장자나 `[111, 0]` 헤더로 후보를 찾고 parse가 버전과 실제 구조를 확인해요. ASCII o로 시작하는 일반 텍스트는 헤더 후보로 취급하지 않아요. JSON root 전체를 `doc.module` envelope로 유지해서 최상위의 알 수 없는 키도 남아요. 원본 id와 optional 필드의 부재를 유지하고, build는 envelope를 2칸 들여쓰기로 직렬화해요.

보존 payload의 `risum:block:N` 항목에는 표시 바이트·길이·인코딩된 데이터까지 에셋 블록 전체를 담아요. build에서는 이를 그대로 이어 붙여요. `assetReferences` 메타데이터로 참조 배열의 변경·삭제·추가·순서 변경을 막아요. 바이너리를 디코딩하거나 재압축하지 않아요.

잘린 헤더·본문·블록, 잘못된 표시, 종료 표시 부재와 종료 뒤 데이터는 `invalid-container`예요. 버전이 0이 아니면 `unsupported-version`, envelope·module 객체나 목록 뼈대가 깨지면 `missing-required-data`예요. UTF-8 또는 JSON 오류는 `invalid-json`이에요. 본문 type·scalar 불일치·필드 부재는 가져온 뒤 validate에서 알려요. 읽을 수 있는 에셋 블록은 참조 개수와 달라도 모두 보관하고, 개수 불일치는 build에서 `preserved-payload-mismatch`로 중단해요. 어떤 데이터도 조용히 버리지 않아요.
