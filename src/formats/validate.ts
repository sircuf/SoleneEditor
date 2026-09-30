import type { ValidateDocument, ValidationIssue } from '$contracts';

// Import/export structure reference: kwaroran/RisuAI main @ f9728b1,
// src/ts/process/modules.ts readModule; src/ts/process/lorebook.svelte.ts
// importLoreBook/exportLoreBook; src/ts/characterCards.ts importCharacterCardSpec,
// convertCharbook, and exportCharacterCard. No normalization is performed here.

type ObjectValue = Record<string, unknown>;

function object(value: unknown): value is ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pointer(path: string, key: string | number): string {
  return `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

export const validate: ValidateDocument = (doc) => {
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) => issues.push({ severity: 'error', path, message });
  const warning = (path: string, message: string) => issues.push({ severity: 'warning', path, message });

  function json(value: unknown, path: string, ancestors: Set<object>): void {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!object(value) && !Array.isArray(value)) {
      error(path, 'JSON으로 보관할 수 없는 값이에요.');
      return;
    }
    if (ancestors.has(value)) {
      error(path, 'JSON에는 순환 참조를 넣을 수 없어요.');
      return;
    }
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      error(path, '바이너리나 클래스 대신 JSON 객체가 필요해요.');
      return;
    }
    ancestors.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) json(value[index], pointer(path, index), ancestors);
    } else {
      for (const key of Object.keys(value)) json(value[key], pointer(path, key), ancestors);
    }
    ancestors.delete(value);
  }

  function field(value: ObjectValue, path: string, key: string, type: string, required = false, severity: ValidationIssue['severity'] = 'warning'): void {
    if (!Object.hasOwn(value, key) && !required) return;
    const item = value[key];
    const valid = type === 'object' ? object(item) :
      type === 'number' ? typeof item === 'number' && Number.isFinite(item) : typeof item === type;
    if (!valid) (severity === 'error' ? error : warning)(pointer(path, key), `${type} 값을 권장해요.`);
  }

  function array(value: ObjectValue, path: string, key: string, visit: (value: unknown, path: string) => void, required = false, severity: ValidationIssue['severity'] = 'error'): void {
    if (!Object.hasOwn(value, key) && !required) return;
    if (!Array.isArray(value[key])) {
      (severity === 'error' ? error : warning)(pointer(path, key), '배열이 필요해요.');
      return;
    }
    value[key].forEach((item, index) => visit(item, pointer(pointer(path, key), index)));
  }

  function strings(value: unknown, path: string): void {
    if (typeof value !== 'string') warning(path, '문자열 항목을 권장해요.');
  }

  function lore(value: unknown, path: string, converted = false): void {
    if (!object(value)) { error(path, '로어북 항목 객체가 필요해요.'); return; }
    field(value, path, 'key', 'string', true, converted ? 'error' : 'warning');
    field(value, path, 'content', 'string', true);
    field(value, path, 'secondkey', 'string', Boolean(value.selective), converted && Boolean(value.selective) ? 'error' : 'warning');
    for (const key of ['comment', 'mode', 'id', 'folder']) field(value, path, key, 'string');
    for (const key of ['insertorder', 'activationPercent', 'bookVersion']) field(value, path, key, 'number');
    for (const key of ['alwaysActive', 'selective', 'useRegex']) field(value, path, key, 'boolean');
    for (const key of ['extentions', 'loreCache']) field(value, path, key, 'object');
    if (converted && value.extentions != null && !object(value.extentions)) {
      error(pointer(path, 'extentions'), '로어북 변환에서 extensions를 갱신하려면 객체가 필요해요.');
    }
    if (typeof value.mode === 'string' && !['multiple', 'constant', 'normal', 'child', 'folder'].includes(value.mode)) {
      warning(pointer(path, 'mode'), '알려지지 않은 로어북 mode예요. 원래 값을 유지해요.');
    }
    if (typeof value.activationPercent === 'number' && (value.activationPercent < 0 || value.activationPercent > 100)) {
      warning(pointer(path, 'activationPercent'), '활성화 확률이 0~100 범위 밖이에요.');
    }
    if (object(value.extentions)) field(value.extentions, pointer(path, 'extentions'), 'risu_case_sensitive', 'boolean');
  }

  function regex(value: unknown, path: string): void {
    if (!object(value)) { error(path, '정규식 항목 객체가 필요해요.'); return; }
    for (const key of ['comment', 'in', 'out', 'type']) field(value, path, key, 'string', true);
    field(value, path, 'flag', 'string');
    field(value, path, 'ableFlag', 'boolean');
  }

  function trigger(value: unknown, path: string): void {
    if (!object(value)) { error(path, '트리거 항목 객체가 필요해요.'); return; }
    field(value, path, 'comment', 'string', true);
    field(value, path, 'type', 'string', true);
    for (const key of ['conditions', 'effect']) {
      if (!Object.hasOwn(value, key)) warning(pointer(path, key), '조건·효과 배열이 없어요.');
      array(value, path, key, (item, itemPath) => {
        if (!object(item)) error(itemPath, '조건·효과는 JSON 객체여야 해요.');
      });
    }
    field(value, path, 'lowLevelAccess', 'boolean');
    if (typeof value.type === 'string' && !['start', 'manual', 'output', 'input', 'display', 'request'].includes(value.type)) {
      warning(pointer(path, 'type'), '알려지지 않은 트리거 type이에요. 원래 값을 유지해요.');
    }
  }

  function module(value: unknown, path: string, converted = false): void {
    if (!object(value)) { error(path, 'risum JSON envelope가 필요해요.'); return; }
    if (value.type !== 'risuModule') error(pointer(path, 'type'), 'risuModule type이 필요해요.');
    if (!object(value.module)) { error(pointer(path, 'module'), 'module 객체가 필요해요.'); return; }
    const data = value.module;
    const modulePath = pointer(path, 'module');
    for (const key of ['name', 'description', 'id']) field(data, modulePath, key, 'string', true);
    array(data, modulePath, 'lorebook', (entry, entryPath) => lore(entry, entryPath, converted));
    array(data, modulePath, 'regex', regex);
    array(data, modulePath, 'trigger', trigger);
    array(data, modulePath, 'assets', (asset, assetPath) => {
      if (!object(asset) && !Array.isArray(asset)) {
        error(assetPath, '에셋 참조 항목은 객체나 튜플이어야 해요.');
        return;
      }
      if (!Array.isArray(asset) || asset.length < 3 || !asset.slice(0, 3).every((part) => typeof part === 'string')) {
        warning(assetPath, '에셋 참조에는 name, data, ext 문자열을 권장해요.');
      }
    });
    if (data.lowLevelAccess === true) warning(pointer(modulePath, 'lowLevelAccess'), '낮은 수준 접근이 허용된 모듈이에요.');
    for (const key of ['lowLevelAccess', 'hideIcon']) field(data, modulePath, key, 'boolean');
  }

  function card(value: unknown, path: string, hasModule: boolean): void {
    if (!object(value)) { error(path, '캐릭터 카드 객체가 필요해요.'); return; }
    if (value.spec !== 'chara_card_v3') error(pointer(path, 'spec'), 'chara_card_v3 spec이 필요해요.');
    field(value, path, 'spec_version', 'string');
    if (typeof value.spec_version === 'string' && value.spec_version !== '3.0') {
      warning(pointer(path, 'spec_version'), '알려지지 않은 카드 버전이에요.');
    }
    if (!object(value.data)) { error(pointer(path, 'data'), '카드 data 객체가 필요해요.'); return; }
    const data = value.data;
    const dataPath = pointer(path, 'data');
    for (const key of ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes',
      'system_prompt', 'post_history_instructions', 'creator', 'character_version']) field(data, dataPath, key, 'string');
    if (data.name === '') warning(pointer(dataPath, 'name'), '캐릭터 이름이 비어 있어요.');
    array(data, dataPath, 'alternate_greetings', strings, false, 'warning');
    array(data, dataPath, 'tags', strings, false, 'warning');
    field(data, dataPath, 'extensions', 'object');
    // importCharacterCardSpec directly reads data.extensions.risuai. The charx
    // import wrapper initializes nullish extensions only when a module exists.
    if (!hasModule && data.extensions == null) {
      error(pointer(dataPath, 'extensions'), 'RisuAI가 data.extensions.risuai를 읽으려면 extensions가 필요해요.');
    }
    if (hasModule && data.extensions != null && !object(data.extensions)) {
      error(pointer(dataPath, 'extensions'), 'module 스크립트를 넣으려면 extensions 객체가 필요해요.');
    }
    if (hasModule && object(data.extensions) && data.extensions.risuai != null && !object(data.extensions.risuai)) {
      error(pointer(pointer(dataPath, 'extensions'), 'risuai'), 'module 스크립트를 넣으려면 risuai 객체가 필요해요.');
    }
    array(data, dataPath, 'assets', (asset, assetPath) => {
      if (!object(asset)) { error(assetPath, '에셋 참조 객체가 필요해요.'); return; }
      field(asset, assetPath, 'uri', 'string', true, 'error');
    });
    if (Object.hasOwn(data, 'character_book')) {
      const bookPath = pointer(dataPath, 'character_book');
      const book = data.character_book;
      if (!object(book)) { error(bookPath, 'character_book 객체가 필요해요.'); return; }
      field(book, bookPath, 'extensions', 'object');
      array(book, bookPath, 'entries', (entry, entryPath) => {
        if (!object(entry)) { error(entryPath, 'CCv3 로어북 항목 객체가 필요해요.'); return; }
        array(entry, entryPath, 'keys', strings, true);
        if (entry.secondary_keys != null) array(entry, entryPath, 'secondary_keys', strings);
        else if (Object.hasOwn(entry, 'secondary_keys')) warning(pointer(entryPath, 'secondary_keys'), '문자열 배열을 권장해요.');
        if (entry.use_regex && Array.isArray(entry.keys) && entry.keys[0] != null && typeof entry.keys[0] !== 'string') {
          error(pointer(pointer(entryPath, 'keys'), 0), 'use_regex 항목의 첫 키는 startsWith를 사용할 수 있는 문자열이어야 해요.');
        }
        for (const key of ['content', 'name', 'comment']) field(entry, entryPath, key, 'string');
        for (const key of ['enabled', 'constant', 'selective', 'case_sensitive', 'use_regex']) field(entry, entryPath, key, 'boolean');
        field(entry, entryPath, 'insertion_order', 'number');
        field(entry, entryPath, 'extensions', 'object');
      }, true);
    }
  }

  json(doc, '', new Set());
  if (!object(doc)) { error('', '문서 객체가 필요해요.'); return issues; }
  switch (doc.kind) {
    case 'charx':
      card(doc.card, '/card', doc.module !== null);
      if (doc.module !== null) module(doc.module, '/module', true);
      break;
    case 'risum':
      module(doc.module, '/module');
      break;
    case 'lorebook':
      if (!object(doc.book)) { error('/book', '로어북 객체가 필요해요.'); break; }
      if (doc.book.type !== 'risu') error('/book/type', 'risu type이 필요해요.');
      field(doc.book, '/book', 'ver', 'number', true);
      array(doc.book, '/book', 'data', lore, true);
      if (typeof doc.book.ver === 'number' && doc.book.ver !== 1) warning('/book/ver', '알려지지 않은 로어북 버전이에요.');
      break;
    default:
      error('/kind', '지원하지 않는 문서 종류예요.');
  }
  return issues;
};
