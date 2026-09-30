# 테스트용 계약 대역

`test-helpers.ts`는 세 레이어 테스트에서 쓸 작은 JSON 문서, 가짜 Storage·FormatsApi, 지연 Promise를 제공해요. Storage는 값을 분리하고 호출 순서를 기록해요. FormatsApi는 테스트 문서를 JSON으로 읽고 써서 실제 포맷 구현 없이 서비스를 확인해요.

테스트 payload의 브랜드 변환은 formats 대역 역할로만 사용해요. 운영 코드에서는 payload를 만들거나 해석하지 않아요. Node 해시는 주입할 SHA-256 대역이고 운영 코드의 브라우저 어댑터와 독립적이에요.
