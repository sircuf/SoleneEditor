# services

주입받은 `Storage`, `FormatsApi`, 다운로드·시각·ID·SHA-256 어댑터를 `createServices`로 연결해요. 다른 레이어의 구현을 가져오지 않아요.

| 서비스 | 역할 |
|---|---|
| Import | 파일 판별, 파싱, 성공했을 때만 기존 데이터 교체, 원본 스냅샷 |
| Autosave | 1초 디바운스로 workspace 저장 |
| Snapshot | n분 타이머, 변경 없으면 건너뛰기, 이벤트·수동 스냅샷, 용량 초과 정리, 복원 |
| Export | 유효성 검사, build, 다운로드, 내보낸 버전 스냅샷, dirty 해제 |

스냅샷·보존 정리·복원·가져오기 commit·내보내기는 직렬화해요. 자동 저장은 별도 쓰기 대기열을 쓰며, 가져오기 전에 예약을 취소하고 실행 중인 쓰기를 기다려요. interval 타이머는 현재 workspace를 매번 읽고 실패를 등록된 오류 콜백에 전달해요.

`index.md`에 해시 규칙과 작업 순서를 설명해요. `adapters.ts`는 브라우저 조립 단계에서 사용할 작은 다운로드·해시·ID·파일 읽기 어댑터예요. `test-helpers.ts`와 `index.test.ts`는 가짜 Storage·FormatsApi와 가짜 타이머로 계약을 확인해요. 실제 포맷 구현이나 파일 샘플에는 의존하지 않아요.
