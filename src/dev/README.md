# dev

UI 개발과 컴포넌트 테스트용 메모리 stores와 샘플을 두어요. createMockStores()는 실제 레이어 없이 EditorStores를 제공해요. doc: null이면 빈 화면을 보여주고 sampleCharx, sampleRisum, sampleLorebook, sampleCharacterBook으로 각 화면을 살펴봐요.

실제 바이너리 파싱·다운로드·IndexedDB·자동 저장 타이머를 제공하지 않아요. 확장자로 샘플을 고르고 메모리에서 내보내기 결과를 반환해요. 실제 앱 wiring에서는 이 mock을 사용하지 않아요.

## UI 미리보기

`npx vite` 실행 후 `/src/dev/preview.html`을 열어요. 운영 빌드에는 들어가지 않아요.

- `?doc=charx|risum|lorebook|book|empty`: 문서 종류 (기본 charx, book은 모듈 없는 카드)
- `&theme=light|dark`, `&dirty`: 테마, 미저장 상태
