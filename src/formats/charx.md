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

## 구현 API와 보존 메타데이터

`charx`는 `FormatCodec<'charx'>`이에요. `.charx` 확장자·ZIP 헤더 또는 JPEG 뒤의 유효한 ZIP 디렉터리로 후보를 판별해요. parse는 ZIP32 중앙 디렉터리와 로컬 헤더를 확인하고 fflate `unzipSync`로 내용을 읽어요. JPEG 안의 우연한 PK 바이트를 ZIP 시작점으로 오인하지 않도록 중앙 디렉터리 오프셋으로 접두부를 구분해요. 상대 오프셋과 JPEG를 포함한 절대 오프셋을 모두 읽을 수 있어요.

payload에는 JPEG 접두부, 원래 이름의 기타 ZIP 항목, 중첩 module의 risum 에셋 블록을 따로 담아요. 메타데이터의 index로 이들을 구분해서 항목 이름이 내부 식별자와 같아도 충돌하지 않아요. 원래 로컬 헤더 순서를 보관하고 동기 fflate Zip/ZipDeflate로 같은 순서에 다시 써요. 숫자로만 된 이름도 순서가 바뀌지 않아요. 압축 방식·ZIP 메타데이터는 달라질 수 있지만 항목 이름과 내용 바이트는 유지해요. RisuAI가 무시하는 기타 JSON이나 큰 에셋도 편집기는 버리지 않아요.

module 있는 카드는 RisuAI `characterCards.ts` 1571~1600행의 변환을 따라 keys·secondary_keys·확률·캐시·대소문자 설정 등을 entries에 다시 반영해요. 카드와 책의 다른 필드는 복사본에서 그대로 유지하고 원본 입력은 바꾸지 않아요. module 로어북이 비어 있고 원래 책이 없었다면 책을 불필요하게 만들지 않아요.

기존 CCv3 항목의 알 수 없는 키와 extensions는 대응하는 Risu 항목에 남겨요. 원본 module 로어북을 provenance로 보관해서 유일한 id, 변하지 않은 항목, 유일한 key/comment 순으로 대응시켜요. 식별할 수 없는 편집은 항목 수가 같은 경우 원래 위치를 사용해요. id 없는 항목을 동시에 크게 바꾸고 재배열하면 대응을 확정할 수 없으므로 UI는 기존 id를 보존해야 해요.

카드의 assets와 Risu 확장의 emotions·additionalAssets·vits 참조 및 module의 에셋 참조를 원본과 비교해 변경을 거부해요. module의 존재 여부도 바꿀 수 없어요. 파일을 다른 문서 종류로 바꾸려면 새로 가져와야 해요.

ZIP64·다중 디스크·암호화 ZIP과 중복 파일명은 현재 지원하지 않아요. ZIP64는 `unsupported-version`, 나머지 잘못된 컨테이너는 `invalid-container`로 실패해요. `card.json` 부재나 card/data·module·목록 뼈대가 편집 불가능하면 `missing-required-data`예요. scalar 불일치나 V3가 아닌 spec도 뼈대가 있으면 그대로 가져오고 validate에서 알려요. 중복 항목을 덮어쓰거나 모르는 데이터를 조용히 버리지 않아요.
