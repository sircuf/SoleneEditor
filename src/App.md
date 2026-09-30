# App

`main.ts`에서 받은 `ready` Promise를 기다리는 동안 한국어 로딩 안내를 보여줘요. 초기화가 끝나면 준비된 stores를 `EditorApp`에 전달해요. 실패하면 새로고침 안내와 펼쳐 볼 수 있는 오류 내용을 보여줘요.

실제 레이어 연결은 `main.ts`가 맡고, App은 계약 타입과 UI 컴포넌트만 가져와요.
