import type {
  CollectionTarget, EditableDocument, ItemAddress, JsonObject, JsonValue,
  LorebookFormat, RisuModule,
} from '$contracts';

const fields: Record<ItemAddress['tab'], readonly string[]> = {
  card: ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes',
    'system_prompt', 'post_history_instructions', 'alternate_greetings', 'character_book', 'tags',
    'creator', 'character_version', 'extensions', 'assets'],
  module: ['name', 'description', 'id', 'lorebook', 'regex', 'trigger', 'cjs', 'lowLevelAccess',
    'hideIcon', 'backgroundEmbedding', 'assets', 'namespace', 'customModuleToggle', 'mcp', 'icon'],
  lorebook: ['key', 'secondkey', 'insertorder', 'comment', 'content', 'mode', 'alwaysActive', 'selective',
    'extentions', 'activationPercent', 'loreCache', 'useRegex', 'bookVersion', 'id', 'folder'],
  regex: ['comment', 'in', 'out', 'type', 'flag', 'ableFlag'],
  trigger: ['comment', 'type', 'conditions', 'effect', 'lowLevelAccess'],
};
const characterEntryFields = ['keys', 'secondary_keys', 'content', 'name', 'comment', 'enabled',
  'insertion_order', 'extensions'];

export function lorebookFormat(doc: EditableDocument): LorebookFormat {
  return doc.kind === 'charx' && doc.module === null ? 'character-book' : 'risu';
}

/** Copy just the ancestors and list that commands mutate; other frozen values stay shared. */
export function copyEditPath(doc: EditableDocument, target: ItemAddress | CollectionTarget): EditableDocument {
  if (target.tab === 'card') {
    if (doc.kind !== 'charx') throw new Error('Document has no card');
    return { ...doc, card: { ...doc.card } };
  }
  if (target.tab === 'lorebook' && doc.kind === 'lorebook') {
    return { ...doc, book: { ...doc.book, data: [...doc.book.data] } };
  }
  if (target.tab === 'lorebook' && doc.kind === 'charx' && doc.module === null) {
    const book = doc.card.data.character_book;
    return {
      ...doc, card: { ...doc.card, data: { ...doc.card.data,
        ...(book ? { character_book: { ...book, ...(book.entries ? { entries: [...book.entries] } : {}) } } : {}),
      } },
    };
  }
  if (doc.kind === 'lorebook' || !doc.module) throw new Error('Document has no module');
  const module = doc.module.module;
  let copied = module;
  if (target.tab !== 'module') {
    const list = module[target.tab];
    copied = { ...module, ...(list ? { [target.tab]: [...list] } : {}) };
  }
  return { ...doc, module: { ...doc.module, module: copied } };
}

function moduleOf(doc: EditableDocument): RisuModule {
  if (doc.kind === 'lorebook' || !doc.module) throw new Error('Document has no module');
  return doc.module.module;
}

export function collection(doc: EditableDocument, target: CollectionTarget, create = false): JsonObject[] {
  if (target.tab === 'lorebook') {
    if (target.format !== lorebookFormat(doc)) throw new Error('Lorebook format does not match the document');
    if (doc.kind === 'lorebook') return doc.book.data;
    if (doc.kind === 'charx' && doc.module === null) {
      if (create) {
        doc.card.data.character_book ??= {};
        doc.card.data.character_book.entries ??= [];
      }
      return doc.card.data.character_book?.entries ?? [];
    }
  }
  const module = moduleOf(doc);
  if (create) module[target.tab] ??= [];
  return module[target.tab] ?? [];
}

export function item(doc: EditableDocument, address: ItemAddress): JsonObject {
  if (address.tab === 'card') {
    if (doc.kind !== 'charx') throw new Error('Document has no card');
    if ('index' in address) throw new Error('Singleton address cannot have an index');
    return doc.card.data;
  }
  if (address.tab === 'module') {
    if ('index' in address) throw new Error('Singleton address cannot have an index');
    return moduleOf(doc);
  }
  const list = collection(doc, address);
  if (!Number.isInteger(address.index) || address.index < 0 || address.index >= list.length) {
    throw new Error('Item index is out of range');
  }
  return list[address.index];
}

export function replaceItem(doc: EditableDocument, address: ItemAddress, value: JsonObject): void {
  item(doc, address); // Validate before assigning.
  if (address.tab === 'card' && doc.kind === 'charx') doc.card.data = value;
  else if (address.tab === 'module') {
    if (doc.kind === 'lorebook' || !doc.module) throw new Error('Document has no module');
    doc.module.module = value as RisuModule;
  } else if (address.tab !== 'card') collection(doc, address)[address.index] = value;
}

export function isJson(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
    && Object.getPrototypeOf(value) !== null) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? Array.from(value).every(child => isJson(child, ancestors))
    : Object.values(value).every(child => isJson(child, ancestors));
  ancestors.delete(value);
  return valid;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Shape checks are local to the selected item; export validation belongs to formats. */
export function validItem(address: ItemAddress | CollectionTarget, value: unknown): value is JsonObject {
  if (!isObject(value) || !isJson(value)) return false;
  const required = (keys: string[], type: string) => keys.every(key => typeof value[key] === type);
  const optional = (keys: string[], type: string) => keys.every(key =>
    !Object.hasOwn(value, key) || typeof value[key] === type);
  const objects = (key: string) => !Object.hasOwn(value, key) || isObject(value[key]);
  const strings = (key: string) => !Object.hasOwn(value, key) ||
    (Array.isArray(value[key]) && value[key].every(entry => typeof entry === 'string'));
  if (address.tab === 'card') {
    return optional(['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
      'creator_notes', 'system_prompt', 'post_history_instructions', 'creator', 'character_version'], 'string')
      && strings('alternate_greetings') && strings('tags') && objects('extensions')
      && (!Object.hasOwn(value, 'assets') || (Array.isArray(value.assets) && value.assets.every(isObject)))
      && (!Object.hasOwn(value, 'character_book') || (isObject(value.character_book)
        && (!Object.hasOwn(value.character_book, 'entries') || (Array.isArray(value.character_book.entries)
          && value.character_book.entries.every(entry => validItem({ tab: 'lorebook', format: 'character-book' }, entry))))));
  }
  if (address.tab === 'module') {
    return required(['name', 'description', 'id'], 'string')
      && optional(['cjs', 'backgroundEmbedding', 'namespace', 'customModuleToggle', 'icon'], 'string')
      && optional(['lowLevelAccess', 'hideIcon'], 'boolean') && objects('mcp')
      && (!Object.hasOwn(value, 'assets') || (Array.isArray(value.assets)
        && value.assets.every(entry => Array.isArray(entry) && entry.length === 3
          && entry.every(part => typeof part === 'string'))))
      && (['lorebook', 'regex', 'trigger'] as const).every(tab => !Object.hasOwn(value, tab)
        || (Array.isArray(value[tab]) && value[tab].every(entry =>
          validItem(tab === 'lorebook' ? { tab, format: 'risu' } : tab === 'regex' ? { tab } : { tab }, entry))));
  }
  if (address.tab === 'lorebook' && address.format === 'character-book') {
    return optional(['content', 'name', 'comment'], 'string') && optional(['enabled'], 'boolean')
      && optional(['insertion_order'], 'number') && strings('keys') && strings('secondary_keys') && objects('extensions');
  }
  if (address.tab === 'lorebook') {
    return required(['key', 'secondkey', 'comment', 'content', 'mode'], 'string')
      && required(['insertorder'], 'number') && required(['alwaysActive', 'selective'], 'boolean')
      && optional(['id', 'folder'], 'string') && optional(['activationPercent', 'bookVersion'], 'number')
      && optional(['useRegex'], 'boolean') && objects('extentions') && objects('loreCache');
  }
  if (address.tab === 'regex') return required(['comment', 'in', 'out', 'type'], 'string')
    && optional(['flag'], 'string') && optional(['ableFlag'], 'boolean');
  return required(['comment', 'type'], 'string') && optional(['lowLevelAccess'], 'boolean')
    && ['conditions', 'effect'].every(key => Array.isArray(value[key]) && value[key].every(isObject));
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  return false;
}

function retainUnknown(old: JsonObject, next: JsonObject, known: readonly string[]) {
  for (const key of Object.keys(old)) {
    if (known.includes(key)) continue;
    if (!Object.hasOwn(next, key)) throw new Error(`Unknown field would be lost: ${key}`);
    retainNestedKeys(old[key], next[key], key);
  }
}

function retainNestedKeys(old: unknown, next: unknown, path: string) {
  if (isObject(old)) {
    if (!isObject(next) && Object.keys(old).length) throw new Error(`Unknown fields would be lost: ${path}`);
    if (isObject(next)) retainUnknown(old, next, []);
  } else if (Array.isArray(old)) {
    old.forEach((child, index) => retainNestedKeys(child, Array.isArray(next) ? next[index] : undefined, `${path}/${index}`));
  }
}

export function guardReplacement(address: ItemAddress, old: JsonObject, next: JsonObject): void {
  retainUnknown(old, next, address.tab === 'lorebook' && address.format === 'character-book'
    ? characterEntryFields : fields[address.tab]);
  // These known container fields have format-private JSON children with no editable schema.
  for (const key of ['extensions', 'extentions', 'loreCache', 'mcp']) {
    if (Object.hasOwn(old, key)) retainNestedKeys(old[key], next[key], key);
  }
  if ((address.tab === 'card' || address.tab === 'module') &&
    (Object.hasOwn(old, 'assets') !== Object.hasOwn(next, 'assets') || !equal(old.assets, next.assets))) {
    throw new Error('Asset references are read-only');
  }
  // Book settings/envelope data are not replaceable through a nested entry editor.
  if (address.tab === 'card' && isObject(old.character_book)) {
    if (!isObject(next.character_book)) throw new Error('Character book settings would be lost');
    retainUnknown(old.character_book, next.character_book, ['entries']);
    const before = old.character_book.entries;
    const after = next.character_book.entries;
    if (Array.isArray(before) && Array.isArray(after)) {
      before.forEach((entry, index) => {
        if (isObject(entry) && isObject(after[index])) {
          retainUnknown(entry, after[index], characterEntryFields);
        }
      });
    }
  }
  if (address.tab === 'module') {
    for (const tab of ['lorebook', 'regex', 'trigger'] as const) {
      const before = old[tab];
      const after = next[tab];
      if (Array.isArray(before) && Array.isArray(after)) {
        before.forEach((entry, index) => {
          if (isObject(entry) && isObject(after[index])) retainUnknown(entry, after[index], fields[tab]);
        });
      }
    }
  }
}
