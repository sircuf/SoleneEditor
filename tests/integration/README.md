# 통합 테스트

`editor.test.ts`에서 실제 formats → storage → services → stores를 연결해요. IndexedDB는 fake-indexeddb로 제공하고, 가져오기는 Node.js 24의 File과 실제 읽기 어댑터를 사용해요. 다운로드 어댑터만 바이트를 모으도록 바꿔요. 스냅샷 간격은 0으로 설정하고 테스트가 끝나면 stores를 정리해요.

- 합성 fixture 각각을 가져와 stores로 로어북 한 항목을 편집하고 내보낸 뒤 다시 파싱해요. 예상 문서 전체와 비교해 알 수 없는 필드를 확인하고, 보관된 바이너리 항목의 이름·순서·바이트도 비교해요.
- 모듈이 있는 charx는 실제 ZIP의 `card.json`에서도 로어북 편집이 반영됐는지 확인해요.
- 기존 작업이 있으면 dirty 여부와 관계없이 확인 창이 열리고, 취소는 작업을 유지하며 계속하기는 고정 원본 스냅샷 하나로 교체하는지 확인해요.
- 수동 스냅샷으로 복원하면 문서가 돌아오고 dirty가 켜지며 복원 전 상태가 별도 스냅샷으로 남는지 확인해요. 복원한 문서도 내보내 다시 파싱해요.
- 첫 stores를 종료한 뒤 같은 IndexedDB를 새 storage와 stores로 열어 문서·dirty·바이너리·스냅샷이 돌아오는지 확인해요.
- `tests/fixtures/real/`에 charx, risum, JSON, JPEG 파일이 있으면 하위 폴더까지 가져오기·내보내기 왕복을 실행해요. 없으면 해당 테스트를 건너뛰어요.

`npm test`로 기존 레이어 테스트와 함께 실행해요. 브라우저 UI를 조작하는 테스트는 아니며, 컴포넌트 테스트는 `src/components/EditorApp.test.ts`에 있어요.
