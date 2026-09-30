# pendingEdits.ts

디바운스된 입력을 stores별로 등록해 두는 작은 레지스트리예요.

- `createPendingEdit(commit, isComposing)`: 300ms 디바운스, 조합 중에는 flush하지 않아요.
- `flushPendingEdits(stores)`: 등록된 모든 입력을 즉시 반영해요. 조합 중인 입력이 있으면 아무것도 하지 않고 `false`를 돌려줘요. 호출한 쪽은 이때 동작을 멈춰요.
- `hasPendingEdits(stores)`: 탭을 닫을 때 경고에 써요.
