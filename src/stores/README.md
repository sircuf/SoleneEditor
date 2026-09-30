# stores

`createEditorStores`가 Svelte readable 상태와 편집 명령을 제공해요. UI는 이 객체만 사용하고 writable store는 공개하지 않아요.

- `workspace`: 현재 문서. 폼과 JSON 뷰가 공유하는 단일 원본
- `ui`: 선택한 탭과 항목, 폼/JSON 모드, 다이얼로그
- `status`: dirty, 마지막 저장 시각, 오류
- `settings`, `snapshots`, `draft`: 설정, 현재 스냅샷 목록, 유효하지 않은 항목 JSON

외부 입력을 분리하고 읽는 값은 깊게 동결해요. 편집은 바뀐 경로만 복사하고 동결된 기존 하위 객체를 재사용해요. 유효한 편집은 dirty를 켜고 자동 저장을 예약해요. 유효하지 않은 JSON은 draft에만 저장하고 이동·모드 전환·내보내기를 막아요. 현재 문서에 맞지 않는 저장된 draft는 시작할 때 지워요. 가져오기·내보내기·복원 중에는 다른 변경 명령을 막아요.

`index.md`는 명령 흐름과 비동기 순서를, `items.md`는 주소·항목 구조·알 수 없는 키와 에셋 참조 보호를 설명해요. `immutable.md`는 상태 동결과 공유 규칙을 설명해요. `index.test.ts`는 가짜 FormatsApi와 Storage를 사용해 편집·draft·가져오기 확인의 세 선택·busy 차단을 확인해요. `benchmark.test.ts`는 큰 charx 로어북의 항목 편집 평균 시간을 출력해요. 수치는 `npm test -- --reporter=verbose`에서 볼 수 있어요.
