# fixtures

## synthetic/ (합성)

`generate-synthetic.mjs`로 만든 파일이에요. RisuAI 소스를 읽고 형식대로 만든 것이라,
**파서가 문서(`src/formats/*.md`)대로 동작하는지** 확인하는 데 써요.
실제 RisuAI 출력과 같다는 보장은 없어요.

| 파일 | 내용 |
|---|---|
| `sample.lorebook.json` | 로어북 3개 (알 수 없는 필드, 따옴표·이모지·여러 줄 포함) |
| `sample.risum` | 로어북·정규식·트리거 + 에셋 1개 |
| `sample.charx` | card.json + module.risum + 에셋 + x_meta |
| `sample-no-module.charx` | module.risum 없는 카드 (다른 앱 출력 가정) |

다시 만들기:
```
node tests/fixtures/generate-synthetic.mjs <RisuAI>/src/ts/rpack/rpack_map.bin
```

## real/ (실제)

RisuAI(main @ `f9728b1`)를 로컬 개발 모드로 띄우고 RisuAI 자체 내보내기 코드로 만든 파일이에요. 호환성의 최종 기준이에요.

| 파일 | 만든 함수 |
|---|---|
| `risuai-sample.charx` | `exportCharacterCard(char, 'charx', { spec: 'v3' })` |
| `risuai-sample.risum` | `exportModuleLegacy(module)` |
| `risuai-sample.lorebook.json` | `exportLoreBook('global')` |

내용은 샘플용으로 직접 만든 캐릭터·모듈이라 공개해도 괜찮아요. 카드의 `character_version: "undefined"`처럼 RisuAI가 실제로 쓰는 값이 그대로 들어 있어요.

SoleneEditor로 편집해 내보낸 세 파일을 RisuAI의 `readModule`, `importCharacterProcess`로 다시 읽어서 편집 내용·정규식·트리거·이미지가 유지되는 것도 확인했어요 (2026-09-30).
