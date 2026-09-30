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
