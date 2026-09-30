# EditorApp.svelte

stores: EditorStores를 받는 UI 진입점이에요. 상태를 구독하고 명령으로만 문서를 바꿔요. stores 초기화·종료와 다운로드 연결은 앱 wiring에서 맡아요.

탭·목록·편집기와 파일 선택·드롭을 연결해요. 카드 필드 선택은 로컬 상태이며 JSON 범위를 바꾸지 않아요. file input은 요청 후 비워 같은 파일도 다시 선택할 수 있어요.

삭제는 확인 모달을 거쳐요. 내보내기의 오류·경고를 구분하고 status.error를 알림으로 표시해요. dirty 또는 draft이면 beforeunload 경고를 요청해요. CSS 변수로 테마를 적용하고 좁은 화면은 세로로 배치해요.
