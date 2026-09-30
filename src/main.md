# 앱 연결

`main.ts`에서 실제 formats, storage, services, stores를 연결해요. 다운로드·File 읽기·ID·SHA-256은 `services/adapters.ts`의 브라우저 어댑터를 쓰고, 현재 시각은 `Date.now`로 전달해요.

초기화 Promise를 App에 전달하고 `stores.initialize()`가 끝나면 편집기를 보여줘요. 초기화 실패 시 만들어진 stores를 정리하고 원래 오류를 화면에 전달해요. `pagehide`에서는 초기화를 기다린 뒤 `stores.dispose()`를 호출해 자동 저장을 비우고 타이머와 구독을 정리해요. 브라우저가 페이지 종료 중 비동기 저장 완료를 보장하지는 않아요.

뒤로·앞으로 가기 캐시에서 돌아온 페이지는 이미 stores를 종료했으므로 새로고침해 다시 초기화해요.
