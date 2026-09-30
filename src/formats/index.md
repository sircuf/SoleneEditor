# index

고정 공개 진입점 `formats: FormatsApi`를 내보내요. registry에 charx·risum·lorebook codec을 제공하고, `detectKind`는 같은 순서로 판별해요. detect는 후보 검사이고 지원 여부의 최종 판단은 parse가 해요. 후보가 없으면 null을 반환해요.

`getAvailableTabs`도 여기에서 구현해요.

| 문서 | 탭 순서 |
|---|---|
| module 있는 charx | card → module → lorebook → regex → trigger |
| module 없는 charx | card → lorebook |
| risum | module → lorebook → regex → trigger |
| lorebook | lorebook |

optional 목록이 없더라도 탭은 표시해요. `validate`는 같은 폴더의 `validate.ts` 구현을 공개해요. 앱 조립은 후속 통합 단계에서 이 객체를 서비스와 stores에 주입해서 진행해요.
