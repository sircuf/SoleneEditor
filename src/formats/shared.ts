import { FormatError } from '$contracts';
import type { DocKind, EditableDocument, JsonObject, PreservedEntry, PreservedPayload } from '$contracts';
import { validate } from './validate';

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new FormatError('invalid-json', 'JSON 또는 UTF-8 문법이 올바르지 않아요.', { cause });
  }
}

export function jsonBytes(value: unknown, spaces?: number): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, spaces));
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Compare JSON structurally, ignoring object key order but retaining array order. */
export function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => equalJson(value, b[index]));
  }
  if (!isObject(a) || !isObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) =>
    Object.hasOwn(b, key) && equalJson(a[key], b[key]));
}

/** Import checks only the object/collection skeleton used to address editors. */
export function assertAddressable(doc: EditableDocument, kind: DocKind): void {
  if (!isObject(doc) || doc.kind !== kind) {
    throw new FormatError('document-kind-mismatch', '문서 종류와 codec이 맞지 않아요.');
  }
  const requiredObject = (value: unknown, path: string): JsonObject => {
    if (!isObject(value)) throw new FormatError('missing-required-data', `${path}: 객체가 필요해요.`);
    return value;
  };
  const collection = (owner: JsonObject, key: string, path: string, tuples = false): JsonObject[] => {
    if (!Object.hasOwn(owner, key)) return [];
    const value = owner[key];
    if (!Array.isArray(value) || !value.every((item) => isObject(item) || (tuples && Array.isArray(item)))) {
      throw new FormatError('missing-required-data', `${path}/${key}: 객체 항목으로 된 배열이 필요해요.`);
    }
    return value as JsonObject[];
  };
  const module = (value: unknown) => {
    const envelope = requiredObject(value, '/module');
    const data = requiredObject(envelope.module, '/module/module');
    collection(data, 'lorebook', '/module/module');
    collection(data, 'regex', '/module/module');
    for (const trigger of collection(data, 'trigger', '/module/module')) {
      collection(trigger, 'conditions', '/module/module/trigger');
      collection(trigger, 'effect', '/module/module/trigger');
    }
    collection(data, 'assets', '/module/module', true);
  };
  switch (doc.kind) {
    case 'charx': {
      const card = requiredObject(doc.card, '/card');
      const data = requiredObject(card.data, '/card/data');
      collection(data, 'assets', '/card/data');
      if (Object.hasOwn(data, 'character_book')) {
        collection(requiredObject(data.character_book, '/card/data/character_book'), 'entries', '/card/data/character_book');
      }
      if (doc.module !== null) module(doc.module);
      break;
    }
    case 'risum':
      module(doc.module);
      break;
    case 'lorebook':
      collection(requiredObject(doc.book, '/book'), 'data', '/book');
      break;
  }
}

export function assertDocument(doc: EditableDocument, kind: DocKind): void {
  if (!isObject(doc) || doc.kind !== kind) {
    throw new FormatError('document-kind-mismatch', '문서 종류와 codec이 맞지 않아요.');
  }
  const issue = validate(doc).find((entry) => entry.severity === 'error');
  if (issue) {
    throw new FormatError('missing-required-data', `${issue.path}: ${issue.message}`);
  }
}

/** Only this layer gives the compile-time brand; the stored object has no symbols. */
export function preserve(kind: DocKind, entries: PreservedEntry[], metadata: JsonObject): PreservedPayload {
  return { kind, entries, metadata } as unknown as PreservedPayload;
}

export function assertPreserved(payload: PreservedPayload, kind: DocKind, schema: string): void {
  if (!payload || payload.kind !== kind || !isObject(payload.metadata) ||
      payload.metadata.schema !== schema || !Array.isArray(payload.entries) ||
      !payload.entries.every((entry) => entry && typeof entry.name === 'string' && entry.bytes instanceof Uint8Array)) {
    throw new FormatError('preserved-payload-mismatch', '보관된 데이터와 포맷이 맞지 않아요.');
  }
}

export function assertAssetReferences(current: unknown, original: unknown): void {
  if (!equalJson(current === undefined ? null : current, original)) {
    throw new FormatError('asset-reference-changed', '보관 중인 에셋 참조는 바꿀 수 없어요.');
  }
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}
