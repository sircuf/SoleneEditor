# storage

IndexedDB와 localStorage 래퍼예요.

- IndexedDB: `workspace`, `snapshots`, `assets`, `draft`
- localStorage: `settings` (작은 설정값만)
- 모든 접근은 try/catch로 감싸요. 저장소가 막혀 있어도 앱은 동작해야 해요.
- 시작할 때 `navigator.storage.persist()`를 요청해요.
