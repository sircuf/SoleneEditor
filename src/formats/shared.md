# shared

포맷 레이어 내부의 작은 공통 함수를 모아요. 공개 진입점이 아니고 다른 레이어에서 직접 가져오지 않아요.

- JSON의 UTF-8 디코딩·직렬화·깊은 복사와 객체 키 순서를 무시하는 구조 비교를 제공해요.
- JSON/UTF-8 오류를 `invalid-json`으로 감싸요. parse용 `assertAddressable`은 객체·목록 뼈대만 검사하고, build용 `assertDocument`는 validate 오류도 `missing-required-data`로 전달해요.
- 문서 종류, payload 종류·스키마, 원본 에셋 참조의 일치를 검사해요.
- `preserve`에서만 payload에 타입 brand를 부여해요. 실제 객체는 Symbol 없이 IndexedDB에 보관할 수 있어요.
- 여러 Uint8Array를 새 배열로 이어 붙여요. 입력 배열은 바꾸지 않아요.

UI·저장소·브라우저 상태를 사용하지 않고 계약과 같은 레이어의 validate에만 의존해요.
