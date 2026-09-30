import type {
  CharacterBookEntry, CharacterCardData, CustomScript, ItemAddress,
  JsonObject, LoreBookEntry, RisuModule, TabId, TriggerScript,
} from '$contracts';

export type FieldKind = 'text' | 'long-text' | 'number' | 'boolean' | 'select' | 'string-list' | 'multiline-list';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  /** select only. An unlisted stored value is still shown and kept as is. */
  options?: readonly FieldOption[];
  /** Monospace input for code-like text (regex, scripts). */
  code?: boolean;
}

// Remove the unknown-key index signature, then restrict both the field key and
// input kind to the named properties approved in the document contracts.
type NamedFields<T> = { [Key in keyof T as string extends Key ? never : Key]: T[Key] };
type KindFor<Value> = Value extends string ? 'text' | 'long-text' | 'select'
  : Value extends number ? 'number' : Value extends boolean ? 'boolean'
    : Value extends string[] ? 'string-list' | 'multiline-list' : never;
export type TypedFieldDefinition<T extends JsonObject> = {
  [Key in keyof NamedFields<T>]-?: Omit<FieldDefinition, 'key' | 'kind'> & {
    key: Key;
    kind: KindFor<NonNullable<NamedFields<T>[Key]>>;
  }
}[keyof NamedFields<T>];

export const tabLabels: Record<TabId, string> = {
  card: '카드', module: '모듈 정보', lorebook: '로어북', regex: '정규식', trigger: '트리거',
};

/** Short fields sit side by side; long text and lists take the full row. */
export function isWide(field: FieldDefinition): boolean {
  return field.kind === 'long-text' || field.kind === 'string-list' || field.kind === 'multiline-list';
}

export const cardFields = [
  { key: 'name', label: '이름', kind: 'text' },
  { key: 'description', label: '설명', kind: 'long-text' },
  { key: 'personality', label: '성격', kind: 'long-text' },
  { key: 'scenario', label: '시나리오', kind: 'long-text' },
  { key: 'first_mes', label: '첫 메시지', kind: 'long-text' },
  { key: 'alternate_greetings', label: '다른 첫 메시지', kind: 'multiline-list', help: '메시지마다 여러 줄을 입력할 수 있어요.' },
  { key: 'mes_example', label: '대화 예시', kind: 'long-text' },
  { key: 'system_prompt', label: '시스템 프롬프트', kind: 'long-text' },
  { key: 'post_history_instructions', label: '대화 뒤 지시문', kind: 'long-text' },
  { key: 'creator_notes', label: '제작자 메모', kind: 'long-text' },
  { key: 'tags', label: '태그', kind: 'string-list', help: '한 줄에 하나씩 입력해요.' },
  { key: 'creator', label: '제작자', kind: 'text' },
  { key: 'character_version', label: '카드 버전', kind: 'text' },
] satisfies TypedFieldDefinition<CharacterCardData>[];

export const moduleFields = [
  { key: 'name', label: '이름', kind: 'text' },
  { key: 'namespace', label: '네임스페이스', kind: 'text' },
  { key: 'description', label: '설명', kind: 'long-text' },
  { key: 'id', label: '모듈 ID', kind: 'text', code: true },
  { key: 'lowLevelAccess', label: '저수준 접근 허용', kind: 'boolean' },
  { key: 'hideIcon', label: '아이콘 숨기기', kind: 'boolean' },
  { key: 'customModuleToggle', label: '모듈 토글', kind: 'long-text', code: true },
  { key: 'cjs', label: '스크립트', kind: 'long-text', code: true },
] satisfies TypedFieldDefinition<RisuModule>[];

// RisuAI loreBook.mode (src/ts/storage/database.svelte.ts).
const loreModes: FieldOption[] = [
  { value: 'normal', label: '일반' },
  { value: 'constant', label: '상시' },
  { value: 'multiple', label: '다중 키' },
  { value: 'child', label: '하위 항목' },
  { value: 'folder', label: '폴더' },
];

export const risuLorebookFields = [
  { key: 'comment', label: '이름', kind: 'text' },
  { key: 'mode', label: '모드', kind: 'select', options: loreModes },
  { key: 'key', label: '키워드', kind: 'text', help: '쉼표로 구분해요.' },
  { key: 'secondkey', label: '보조 키워드', kind: 'text', help: '선택적 활성화일 때 함께 확인해요.' },
  { key: 'insertorder', label: '삽입 순서', kind: 'number' },
  { key: 'activationPercent', label: '활성화 확률 (%)', kind: 'number' },
  { key: 'alwaysActive', label: '항상 활성화', kind: 'boolean' },
  { key: 'selective', label: '선택적 활성화', kind: 'boolean' },
  { key: 'useRegex', label: '키워드를 정규식으로', kind: 'boolean' },
  { key: 'content', label: '내용', kind: 'long-text' },
] satisfies TypedFieldDefinition<LoreBookEntry>[];

export const characterBookFields = [
  { key: 'name', label: '이름', kind: 'text' },
  { key: 'comment', label: '메모', kind: 'text' },
  { key: 'insertion_order', label: '삽입 순서', kind: 'number' },
  { key: 'enabled', label: '활성화', kind: 'boolean' },
  { key: 'keys', label: '키워드', kind: 'string-list', help: '한 줄에 하나씩 입력해요.' },
  { key: 'secondary_keys', label: '보조 키워드', kind: 'string-list', help: '한 줄에 하나씩 입력해요.' },
  { key: 'content', label: '내용', kind: 'long-text' },
] satisfies TypedFieldDefinition<CharacterBookEntry>[];

// RisuAI src/lib/SideBars/Scripts/RegexData.svelte type options.
const regexTypes: FieldOption[] = [
  { value: 'editinput', label: '입력문 수정' },
  { value: 'editoutput', label: '출력문 수정' },
  { value: 'editprocess', label: '리퀘스트 데이터 수정' },
  { value: 'editdisplay', label: '디스플레이 수정' },
  { value: 'edittrans', label: '번역문 수정' },
];

export const regexFields = [
  { key: 'comment', label: '이름', kind: 'text' },
  { key: 'type', label: '유형', kind: 'select', options: regexTypes },
  { key: 'flag', label: '플래그', kind: 'text', code: true },
  { key: 'ableFlag', label: '플래그 사용', kind: 'boolean' },
  { key: 'in', label: '찾을 정규식', kind: 'long-text', code: true },
  { key: 'out', label: '바꿀 내용', kind: 'long-text' },
] satisfies TypedFieldDefinition<CustomScript>[];

// RisuAI triggerscript.type (src/ts/process/triggers.ts).
const triggerTypes: FieldOption[] = [
  { value: 'start', label: '채팅 시작' },
  { value: 'input', label: '입력' },
  { value: 'output', label: '출력' },
  { value: 'display', label: '디스플레이' },
  { value: 'request', label: '리퀘스트' },
  { value: 'manual', label: '수동 실행' },
];

export const triggerFields = [
  { key: 'comment', label: '이름', kind: 'text' },
  { key: 'type', label: '실행 시점', kind: 'select', options: triggerTypes },
] satisfies TypedFieldDefinition<TriggerScript>[];

export function fieldsFor(address: ItemAddress): readonly FieldDefinition[] {
  switch (address.tab) {
    case 'card': return cardFields;
    case 'module': return moduleFields;
    case 'lorebook': return address.format === 'risu' ? risuLorebookFields : characterBookFields;
    case 'regex': return regexFields;
    case 'trigger': return triggerFields;
  }
}
