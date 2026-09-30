# rpack

기준: `kwaroran/RisuAI` main @ `f9728b1` (2026-09-29) — `src/ts/rpack/rpack_js.js`, `rpack_map.bin`

## 구조

압축이나 암호화가 아니라 **1바이트 치환 테이블**이에요.

- `rpack_map.bin`은 512바이트예요.
  - `[0, 256)`: 인코딩 테이블. `encoded[i] = encodeMap[data[i]]`
  - `[256, 512)`: 디코딩 테이블. `decoded[i] = decodeMap[data[i]]`
- 입력과 출력 길이가 같아요.

## 구현 메모

- 테이블을 TS 상수(`Uint8Array`)로 넣으면 fetch 없이 동기로 동작해요.
- 테스트: 0~255 전체 바이트에 대해 `decode(encode(x)) === x`.

## ⚠️ 라이선스

rpack은 **MIT / AGPL-3.0 듀얼 라이선스**예요. MIT는 "RisuAI 안에서만 쓸 때"에만 적용되고,
다른 앱에서 쓰면 **AGPL-3.0**을 따라야 해요 (`src/ts/rpack/LICENSE`).
GPL-3.0 프로젝트와 AGPL-3.0 코드는 함께 쓸 수 있지만(GPLv3 13조), 이 파일은 AGPL 조건이 유지돼요.
그래서 프로젝트 전체를 **AGPL-3.0**으로 정했어요 (`docs/DECISIONS.md`).
