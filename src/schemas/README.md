# schemas

`fields.ts`에서 `$contracts` 타입에 맞춘 카드, 모듈, Risu 로어북, Character Book 로어북, 정규식, 트리거 필드를 정의해요. 트리거 폼에는 comment와 type만 보여주고 conditions와 effect는 JSON에서 편집해요. Risu의 extentions와 Character Book의 extensions도 JSON에 그대로 두어요.

필드 종류는 짧은 텍스트, 긴 텍스트, 숫자, 체크박스, 문자열 목록이에요. 문자열 목록은 한 줄에 하나씩 입력해요. 모르는 모드와 유형을 보존하려고 해당 필드는 텍스트로 보여줘요. 스키마에 없는 키를 제거하거나 없는 선택 필드를 자동으로 만들지 않아요.

탭별 폼에 보여줄 필드 정의예요 (로어북, 정규식, 트리거, 카드, 모듈 정보).

- 자주 쓰는 필드만 폼으로 보여줘요. 나머지는 JSON 모드에서 편집해요.
- 필드 이름과 타입은 RisuAI 원본 타입 정의를 기준으로 해요.
