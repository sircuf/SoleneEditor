# 브라우저 어댑터

`downloadFile`은 원본 파일명과 바이트로 Blob URL을 만들고 임시 anchor를 눌러 다운로드를 시작해요. anchor를 제거하고 다음 타이머에서 URL을 해제해요. 성공은 다운로드 시작을 의미해요.

`sha256Hex`는 Web Crypto SHA-256 결과를 소문자 hex로 바꿔요. `newId`는 `crypto.randomUUID`, `readFile`은 `File.arrayBuffer`를 사용해요. 지원되지 않는 환경의 오류는 호출자에게 전달해요. 앱 조립은 이 파일에서 하지 않아요.
