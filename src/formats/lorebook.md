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

MVP는 `type: 'risu'`만 지원하고, 나머지는 "지원하지 않는 형식"으로 안내해요.
