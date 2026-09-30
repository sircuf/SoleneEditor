# lorebook

기준: `kwaroran/RisuAI` main @ `f9728b1` (2026-09-29) — `src/ts/process/lorebook.svelte.ts` (`exportLoreBook`, 가져오기, `convertExternalLorebook`)

## Risu 로어북 파일

```json
{ "type": "risu", "ver": 1, "data": [loreBook, ...] }
```

## loreBook

```ts
interface loreBook {
  key: string            // 쉼표로 구분된 키워드 (배열 아님)
  secondkey: string
  insertorder: number
  comment: string        // UI에서 이름으로 보이는 값
  content: string
  mode: 'multiple'|'constant'|'normal'|'child'|'folder'
  alwaysActive: boolean
  selective: boolean
  extentions?: { risu_case_sensitive: boolean }   // 철자 extentions 주의
  activationPercent?: number
  loreCache?: { key: string; data: string[] }
  useRegex?: boolean
  bookVersion?: number
  id?: string
  folder?: string
}
```

## 그 밖의 JSON (MVP 범위 밖, 참고)

RisuAI는 이런 JSON도 가져와요:
- `{ entries: {...} }`: 외부(SillyTavern 등) 로어북 → `convertExternalLorebook`으로 변환
- `{ type: 'regex', data: [...] }`: 정규식 묶음
- `{ type: 'risuModule', ... }`: JSON 모듈

MVP의 내보내기 대상은 `type: 'risu'`예요. 다른 type도 객체·목록 뼈대가 편집 가능하면 원본 그대로 가져와 validate에서 오류로 알리고 내보내기를 막아요. 외부 포맷을 자동 변환하지 않아요.

## 구현 API

`lorebook`은 `FormatCodec<'lorebook'>`이에요. `.json`·`.lorebook` 확장자 또는 JSON의 `type: 'risu'`로 후보를 판별해요. parse는 root 객체와, data가 있다면 객체 항목 배열인지 검사해요. 다른 type·ver 불일치·scalar 필드는 validate에 맡겨요. UTF-8·JSON 문법 오류는 `invalid-json`, 편집할 수 없는 객체·목록 구조는 `missing-required-data`예요. data가 없으면 가져오기는 허용하지만 RisuAI에 내용이 전달되지 않으므로 validate 오류로 내보내기를 막아요.

`doc.book`에 root 전체를 보관해서 ver와 알 수 없는 키를 그대로 유지해요. RisuAI 가져오기가 ver로 분기하지 않으므로 ver 부재·타입 불일치·미래 버전은 보존하고 경고해요. 바이너리는 없고 payload는 빈 entries와 포맷 식별 메타데이터만 담아요. build는 원본 객체를 바꾸지 않고 compact JSON을 반환해요.
