# charx

기준: `kwaroran/RisuAI` main @ `f9728b1` (2026-09-29) — `src/ts/characterCards.ts` (가져오기 81~165행, `exportCharacterCard`), `src/ts/process/processzip.ts` (`CharXImporter`, `CharXWriter`)

## ZIP 구조

```
card.json          Character Card V3 (spec: "chara_card_v3")
module.risum       정규식, 트리거, 로어북 (risum.md 형식)
assets/<type>/<kind>/<name>.<ext>   에셋 (예: assets/icon/image/main.png)
x_meta/<name>.json                  에셋 메타데이터 (PNG 청크 등)
```

- `.charx`는 ZIP이고, `.jpg/.jpeg` charx는 **JPEG 뒤에 ZIP을 이어 붙인** 형태예요 (`charxJpeg`).
- RisuAI 가져오기는 `card.json`, `module.risum` 외의 `.json` 파일을 무시하고, 나머지를 에셋으로 취급해요.
- 50MB를 넘는 파일은 RisuAI가 제외해요.
- 카드 안 에셋 참조: `card.data.assets[i].uri = "embeded://assets/..."` (철자 `embeded` 주의)

## 데이터가 어디에 있나 (중요)

| 데이터 | 위치 | RisuAI 가져오기 동작 |
|---|---|---|
| 카드 필드 (설명, 첫 메시지 등) | `card.json` `data.*` | 그대로 사용 |
| 정규식 | `module.risum` `regex` | `extensions.risuai.customScripts`로 넣음 |
| 트리거 | `module.risum` `trigger` | `extensions.risuai.triggerscript`로 넣음 |
| 로어북 | **두 군데**: `card.json` `data.character_book`(CCv3 형식)과 `module.risum` `lorebook`(Risu 형식) | **module 쪽이 있으면 그걸 쓰고**, character_book 항목은 무시 (설정값만 사용) |

RisuAI가 내보낼 때는 정규식·트리거를 card.json에서 **지우고** module.risum에만 넣어요.
로어북은 module.risum과 character_book 양쪽에 모두 써요.

## 편집기 방침

- 로어북·정규식·트리거는 **module.risum 쪽을 편집 원본**으로 삼아요.
- `character_book`은 다른 앱 호환용 사본이에요. **내보낼 때 module 로어북에서 다시 생성해요** (docs/DECISIONS.md). 설정값(scan_depth 등)과 extensions는 원본을 유지해요.
- module.risum이 없는 charx(다른 앱에서 만든 카드)는 character_book을 편집 대상으로 삼아야 해요.

## 보존 규칙

- `card.json`, `module.risum` 이외의 ZIP 항목은 **이름과 바이트를 그대로** 보관했다가 다시 넣어요.
- 가능하면 원래 항목 순서도 유지해요.
- charxJpeg는 앞쪽 JPEG 바이트도 그대로 보관해요.

## 카드 필드 (card.json `data`)

`name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt,
post_history_instructions, alternate_greetings[], character_book, tags[], creator, character_version,
extensions.risuai.{...}` 등. 폼에는 주요 텍스트 필드만, 나머지는 JSON 모드에서 편집해요.
