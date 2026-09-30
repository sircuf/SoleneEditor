# fields.ts

FieldDefinition과 FieldKind로 표시 필드를 정의해요. TypedFieldDefinition<T>는 계약의 명시적 필드 이름과 그 자료형에 맞는 입력 종류를 검사해요. 모르는 키를 보존하는 인덱스 시그니처는 스키마 정의의 키 검사에서 제외해요. fieldsFor(address)는 탭과 로어북 형식에 맞는 배열을, tabLabels는 한국어 탭 이름을 제공해요.

에셋 참조를 편집하는 폼은 제공하지 않아요. 복합 자료형, 책 설정, extensions와 기타 필드는 객체에 그대로 두고 JSON으로 접근해요.

`select` 필드는 RisuAI의 선택지(로어북 mode, 정규식 type, 트리거 type)를 따라요. 목록에 없는 값은 UI가 그대로 보여주고 보존해요. `code: true`는 고정폭 글꼴로 보여줘요. `isWide`는 전체 폭으로 배치할 필드를 정해요.
