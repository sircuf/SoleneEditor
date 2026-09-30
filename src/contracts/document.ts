/** JSON values only: finite numbers, no cycles, BigInt, functions, or binary. */
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

/**
 * Unknown JSON keys must survive every edit and parse/build round trip.
 * `undefined` permits optional TS fields; it means an ABSENT key, never a stored value.
 * Implementations must not materialize missing optional fields during parsing.
 */
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type DocKind = 'charx' | 'risum' | 'lorebook';
export type TabId = 'card' | 'module' | 'lorebook' | 'regex' | 'trigger';
export type LorebookFormat = 'risu' | 'character-book';

export interface LoreBookEntry extends JsonObject {
  key: string;
  secondkey: string;
  insertorder: number;
  comment: string;
  content: string;
  // Keep unfamiliar modes too; validators may warn, but must not rewrite them.
  mode: string;
  alwaysActive: boolean;
  selective: boolean;
  // RisuAI spells this field "extentions".
  extentions?: JsonObject;
  activationPercent?: number;
  loreCache?: JsonObject;
  useRegex?: boolean;
  bookVersion?: number;
  id?: string;
  folder?: string;
}

export interface CustomScript extends JsonObject {
  comment: string;
  in: string;
  out: string;
  type: string;
  flag?: string;
  ableFlag?: boolean;
}

export interface TriggerScript extends JsonObject {
  comment: string;
  // Known values: start, manual, output, input, display, request.
  type: string;
  conditions: JsonObject[];
  effect: JsonObject[];
  lowLevelAccess?: boolean;
}

/** Original metadata tuples; the data/path string is NOT an asset binary. */
export type ModuleAssetReference = [name: string, data: string, ext: string];

export interface RisuModule extends JsonObject {
  name: string;
  description: string;
  id: string;
  lorebook?: LoreBookEntry[];
  regex?: CustomScript[];
  trigger?: TriggerScript[];
  cjs?: string;
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  backgroundEmbedding?: string;
  assets?: ModuleAssetReference[];
  namespace?: string;
  customModuleToggle?: string;
  mcp?: JsonObject;
  icon?: string;
}

/** Loose CCv3 entry shape; do not convert non-Risu cards into Risu entries. */
export interface CharacterBookEntry extends JsonObject {
  keys?: string[];
  secondary_keys?: string[];
  content?: string;
  name?: string;
  comment?: string;
  enabled?: boolean;
  insertion_order?: number;
  extensions?: JsonObject;
}

export interface CharacterBook extends JsonObject {
  entries?: CharacterBookEntry[];
  extensions?: JsonObject;
  // All other book settings (scan_depth, token_budget, etc.) remain unknown keys.
}

export interface CharacterCardData extends JsonObject {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  character_book?: CharacterBook;
  tags?: string[];
  creator?: string;
  character_version?: string;
  extensions?: JsonObject;
  // URI/reference metadata only; actual binary stays in PreservedPayload.
  assets?: JsonObject[];
}

export interface CharacterCardV3 extends JsonObject {
  spec?: string;
  spec_version?: string;
  data: CharacterCardData;
}

/** The whole risum JSON envelope is editable JSON, including unknown root keys. */
export interface RisuModuleEnvelope extends JsonObject {
  type: 'risuModule';
  module: RisuModule;
}

/** The whole standalone lorebook root is retained, not just its data array. */
export interface RisuLorebook extends JsonObject {
  type: 'risu';
  ver: number;
  data: LoreBookEntry[];
}

export interface CharxDocument {
  kind: 'charx';
  card: CharacterCardV3;
  // Null means module.risum was absent; do not create one on import/build.
  module: RisuModuleEnvelope | null;
}

export interface RisumDocument {
  kind: 'risum';
  module: RisuModuleEnvelope;
}

export interface LorebookDocument {
  kind: 'lorebook';
  book: RisuLorebook;
}

/** Only normalized wrappers lack an index signature; their RisuAI JSON children do not. */
export type EditableDocument = CharxDocument | RisumDocument | LorebookDocument;
export type DocumentOf<K extends DocKind> = Extract<EditableDocument, { kind: K }>;

/**
 * Ordered tabs: charx with module = card/module/lorebook/regex/trigger;
 * charx without module = card/lorebook; risum = module/lorebook/regex/trigger;
 * lorebook = lorebook. Missing optional collections still get an empty list view.
 */
export type GetAvailableTabs = (doc: EditableDocument) => readonly TabId[];

/** Singleton editors: card targets card.data; module targets envelope.module. */
export type SingletonAddress = { tab: 'card' } | { tab: 'module' };

/**
 * Risu lorebook: charx.module.module.lorebook, risum.module.module.lorebook,
 * or lorebook.book.data. Character-book: module-less charx.card.data.character_book.entries.
 * Regex/trigger: the current charx/risum envelope.module.regex/trigger arrays.
 * Indices are zero-based. No item IDs are synthesized or rewritten.
 */
export type CollectionTarget =
  | { tab: 'lorebook'; format: 'risu' }
  | { tab: 'lorebook'; format: 'character-book' }
  | { tab: 'regex' }
  | { tab: 'trigger' };
export type CollectionAddress = CollectionTarget & { index: number };
export type ItemAddress = SingletonAddress | CollectionAddress;

export type ItemValue<T extends SingletonAddress | CollectionTarget> =
  T extends { tab: 'card' } ? CharacterCardData :
  T extends { tab: 'module' } ? RisuModule :
  T extends { tab: 'lorebook'; format: 'risu' } ? LoreBookEntry :
  T extends { tab: 'lorebook'; format: 'character-book' } ? CharacterBookEntry :
  T extends { tab: 'regex' } ? CustomScript :
  T extends { tab: 'trigger' } ? TriggerScript : never;

/** Readable state is immutable; all edits go through commands. */
export type DeepReadonly<T> =
  T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
