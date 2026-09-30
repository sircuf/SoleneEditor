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

## real/ (실제, 예정)

실제 RisuAI에서 내보낸 파일. 호환성의 최종 기준이에요. 공개해도 되는 파일만 넣어요.
