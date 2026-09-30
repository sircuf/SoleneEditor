# 저장 어댑터

`createStorage`가 이름이 `solene-editor`인 IndexedDB 버전 1을 열어요. `workspace`, `preserved`, `draft`는 `current` 키를 쓰고, `snapshots`는 레코드의 `id`를 키로 써요. 설정은 localStorage의 `solene-editor.settings`에 저장해요.

초기 데이터를 한 읽기 트랜잭션으로 받아 메모리 사본을 만들어요. 이후 호출은 같은 Promise 대기열에서 처리해요. 입력과 반환값을 structured clone으로 분리하고, payload는 내부를 해석하지 않고 통째로 보관해요.

일반 쓰기는 DB에 먼저 시도하고 실패하면 DB 연결을 닫아 메모리로 전환해요. 가져오기 교체는 예외예요. 네 저장소의 삭제와 새 workspace·payload·고정 원본 스냅샷 삽입이 모두 commit된 뒤에만 메모리 사본을 바꿔요. 실패하면 트랜잭션을 abort하고 오류를 전달해 이전 workspace·draft·스냅샷·payload를 유지해요. 실패한 교체를 성공으로 취급하지 않아요.

설정은 유한한 숫자와 정해진 문자열 값만 받아요. 저장된 설정 전체가 없거나 잘못되었으면 계약 기본값을 반환해요. localStorage 실패는 IndexedDB 사용 여부와 독립적으로 처리해요.
