# storage

IndexedDB와 localStorage를 `$contracts`의 `Storage`로 감싸요. `createStorage()`가 초기화를 마친 어댑터를 반환해요.

- IndexedDB: `workspace`, `snapshots`, `preserved`, `draft`
- localStorage: `settings` (작은 설정값만)
- `idb`로 접근하고 메모리 사본과 쓰기 순서를 함께 관리해요. 일반 저장 실패는 메모리 저장으로 전환해 편집을 계속해요.
- 가져오기 교체는 네 object store를 한 트랜잭션으로 바꿔요. 교체 실패는 오류를 전달하고 이전 DB와 메모리 상태를 그대로 유지해요. 이후 재시도는 메모리에서 처리해요.
- 반환값은 분리된 사본이에요. 스냅샷은 시간, ID 순으로 정렬하고 총용량에 고정 항목도 포함해요.
- 시작할 때 `navigator.storage.persist()`를 요청해요. 거부되거나 사용할 수 없어도 초기화는 계속해요.
- 설정 기본값은 5분, 100 MiB, system, form이에요. 읽은 설정이 잘못되면 기본값을 쓰고 잘못된 설정 쓰기는 거부해요.

`index.md`에 실패 처리와 저장 구조를 설명해요. `index.test.ts`는 fake-indexeddb로 실제 트랜잭션 경로, 차단된 저장소의 메모리 경로, 교체 중 abort의 원자성을 확인해요.
