# validate

`validate`는 승인된 `ValidateDocument` 함수예요. 문서를 바꾸지 않고 `{ severity, path, message }` 배열을 반환해요. path는 EditableDocument 기준의 RFC 6901 JSON Pointer예요. 오류는 내보내기를 막고 경고는 허용해요.

## 가져오기와 내보내기

parse는 validate를 호출하지 않아요. 별도의 `assertAddressable`로 컨테이너·JSON과 객체·목록 뼈대만 확인해요. card/data, risum envelope/module, standalone book은 객체여야 해요. lorebook·regex·trigger·assets·character_book.entries, 트리거 conditions/effect가 있으면 배열이어야 해요. 편집 항목은 객체이고 module.assets의 튜플 배열도 허용해요. character_book이 있으면 객체여야 해요. 깨진 뼈대는 `missing-required-data`예요.

없는 목록이나 optional에 가까운 필드는 자동으로 만들지 않아요. spec/type이나 scalar 타입이 달라도 편집 가능한 JSON은 그대로 가져와요. validate에서 오류가 나더라도 가져온 내용을 보관할 수 있고, build는 오류가 해결되기 전에는 중단해요. 에셋 블록·참조 개수 불일치도 읽을 수 있으면 가져오고 build에서 확인해요.

## 오류와 근거

아래 RisuAI 경로·행 번호는 `kwaroran/RisuAI` main @ `f9728b1` 기준이에요. 실제 가져오기나 변환이 실패하거나 데이터가 사라지는 경우만 오류로 남겨요. 편집 주소를 만들 수 없는 목록 구조도 오류예요.

| 오류 클래스 | 조건과 근거 |
|---|---|
| JSON에 보관할 수 없는 값 | 순환 참조는 JSON.stringify가 실패하고 undefined·함수·비유한 수·클래스·바이너리는 값이 사라지거나 바뀌어요. 앱의 `shared.ts` jsonBytes/cloneJson과 각 codec의 build가 사용하므로 데이터 손실을 막아요 |
| 객체·목록 뼈대 | card/data, module/envelope, book, 존재하는 목록과 항목의 구조가 깨져 편집 주소를 만들 수 없어요. RisuAI `process/modules.ts` readModule은 main.module.assets를 읽고, `process/lorebook.svelte.ts` 682~685행은 data를 순회해요. 앱의 charx build도 module 로어북을 map해요 |
| 잘못된 kind/spec/type, standalone data 부재 | charx의 V3 spec은 `characterCards.ts` 143~147행에서, risum type은 `process/modules.ts` 158~164행에서 검사해요. standalone은 `process/lorebook.svelte.ts` 682~689행의 risu/data 분기가 맞지 않으면 내용을 가져오지 않아요 |
| charx module 로어북의 key/secondkey | `characterCards.ts` 1586~1587행의 `lore.key.split`과 truthy selective일 때 `lore.secondkey.split`이 호출돼요. 앱의 `charx.ts` cardBookEntry도 같은 호출을 해요. 따라서 key는 문자열, selective가 참으로 평가되면 secondkey도 문자열이어야 해요 |
| charx module 로어북의 extentions | nullish 값은 빈 객체로 대체할 수 있지만 그 밖의 비객체는 `characterCards.ts` 1572~1582행의 ext.risu_activationPercent/risu_loreCache 갱신이 실패하거나 배열 JSON에서 필드가 사라져요. nullish 값 자체는 경고에 그쳐요 |
| CCv3 keys/secondary_keys와 regex 첫 키 | `characterCards.ts` convertCharbook 1120~1123행의 keys.join 및 nullish가 아닌 secondary_keys.join이 필요해요. 1061행은 use_regex가 truthy일 때 첫 키의 startsWith를 호출해요. 배열의 일반 scalar 항목은 join이 문자열로 바꾸므로 경고이고, regex 첫 키의 비문자열만 오류예요 |
| 카드 에셋 URI | `characterCards.ts` 850~902행에서 uri.startsWith를 호출해요. URI가 없거나 비문자열이면 가져오기가 실패해요 |
| 카드 extensions 초기화/갱신 | module 없는 카드는 `characterCards.ts` 730~734행에서 data.extensions.risuai를 직접 읽으므로 nullish extensions가 오류예요. module 있는 카드는 149~159행에서 nullish extensions/risuai를 초기화하지만 비객체 값에는 module 스크립트 필드를 넣을 수 없어 오류예요 |

key/secondkey/extentions의 변환 오류는 **charx에 module이 있을 때만** 적용해요. standalone lorebook과 risum은 JSON을 그대로 쓰므로 같은 scalar 불일치는 경고예요. 트리거 conditions/effect는 존재할 때만 뼈대를 검사하고 부재는 경고예요. 조건·효과의 세부 종류는 해석하지 않아요.

에셋 참조와 원본 바이너리의 일치는 doc만으로 알 수 없어요. codec이 payload를 사용해 확인하고 변경·개수 불일치를 FormatError로 내보내요. validate에서 새 바이너리를 만들거나 원본을 고치지 않아요.

## 경고

module name·description·id 부재나 타입 불일치, 정규식/트리거의 scalar 필드 불일치, 일반 카드 텍스트·tags·alternate_greetings 타입 불일치, 강제 변환하지 않는 로어북의 key/content 등은 경고예요. RisuAI 가져오기나 앱 build가 해당 scalar에 문자열 메서드를 호출하지 않으므로 원래 값을 유지해요.

알 수 없는 로어북 mode·트리거 type·카드 버전, ver 부재·타입 불일치·미래 숫자 버전, 범위 밖 activationPercent, 빈 캐릭터 이름과 lowLevelAccess도 경고해요. module 에셋 튜플의 필드 타입이나 길이는 원본대로 보관하되 권장 모양을 안내해요.

정규식 컴파일·트리거 실행·원격 에셋 접근을 하지 않아요. 전체 RisuAI 런타임 스키마 검증이 아니라 편집·가져오기·직렬화를 위한 기본 검사예요.
