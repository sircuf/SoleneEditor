import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { FormatError } from '$contracts';
import type { EditableDocument, FormatCodec, FormatErrorCode, JsonObject } from '$contracts';
import { formats } from '../src/formats';
import { decodeRPack, encodeRPack } from '../src/formats/rpack';

const syntheticDirectory = fileURLToPath(new URL('./fixtures/synthetic/', import.meta.url));
const syntheticFiles = readdirSync(syntheticDirectory);
const fixture = (name: string) => new Uint8Array(readFileSync(`${syntheticDirectory}/${name}`));
const json = (value: unknown) => strToU8(JSON.stringify(value));

function risumBytes(envelope: unknown): Uint8Array {
  const body = encodeRPack(json(envelope));
  const bytes = new Uint8Array(body.length + 7);
  bytes[0] = 111;
  new DataView(bytes.buffer).setUint32(2, body.length, true);
  bytes.set(body, 6);
  return bytes;
}

function codecFor(name: string, bytes: Uint8Array): FormatCodec {
  const kind = formats.detectKind(name, bytes);
  expect(kind).not.toBeNull();
  if (kind === null) throw new Error(`Undetected fixture: ${name}`);
  // The filename selects the matching doc/codec pair; erase the generic only here.
  return formats.registry[kind] as unknown as FormatCodec;
}

function roundTrip(name: string, bytes: Uint8Array): void {
  const codec = codecFor(name, bytes);
  const first = codec.parse(bytes, name);
  const beforeDoc = structuredClone(first.doc);
  const beforePreserved = structuredClone(first.preserved);
  const built = codec.build(first.doc, first.preserved);
  const second = codec.parse(built, name);
  expect(second.doc).toEqual(first.doc);
  expect(second.preserved.entries).toEqual(first.preserved.entries);
  expect(first.doc).toEqual(beforeDoc);
  expect(first.preserved).toEqual(beforePreserved);
}

function expectCode(action: () => unknown, code: FormatErrorCode): void {
  expect(action).toThrow(FormatError);
  try {
    action();
    throw new Error('Expected FormatError');
  } catch (error) {
    expect(error).toBeInstanceOf(FormatError);
    expect((error as FormatError).code).toBe(code);
  }
}

function unknownFields(value: unknown): unknown[] {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === 'unknownFieldForRoundTrip' ? [item] : unknownFields(item));
}

describe('rpack', () => {
  test('round-trips every byte without mutating input', () => {
    const input = Uint8Array.from({ length: 256 }, (_, index) => index);
    const original = input.slice();
    expect(decodeRPack(encodeRPack(input))).toEqual(input);
    expect(input).toEqual(original);
    expect(encodeRPack(new Uint8Array())).toEqual(new Uint8Array());
  });
});

describe('synthetic round trips', () => {
  test.each(syntheticFiles)('%s retains editable JSON and every preserved binary', (name) => {
    roundTrip(name, fixture(name));
    const codec = codecFor(name, fixture(name));
    const parsed = codec.parse(fixture(name), name);
    expect(formats.validate(parsed.doc).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(unknownFields(codec.parse(codec.build(parsed.doc, parsed.preserved), name).doc)).toEqual(unknownFields(parsed.doc));
  });

  test('fixtures exercise unknownFieldForRoundTrip', () => {
    const values = syntheticFiles.flatMap((name) => codecFor(name, fixture(name)).parse(fixture(name), name).doc)
      .flatMap(unknownFields);
    expect(values).toContainEqual({ keep: true });
  });

  test.each(['sample.risum', 'sample.charx', 'sample.lorebook.json'])('%s preserves unknown root and nested fields', (name) => {
    const codec = codecFor(name, fixture(name));
    const parsed = codec.parse(fixture(name), name);
    let root: JsonObject;
    switch (parsed.doc.kind) {
      case 'charx': root = parsed.doc.card; break;
      case 'risum': root = parsed.doc.module; break;
      case 'lorebook': root = parsed.doc.book; break;
    }
    root.unknownFieldForRoundTrip = { nested: { future: [null, true, '🔮'] } };
    const rebuilt = codec.parse(codec.build(parsed.doc, parsed.preserved), name);
    expect(rebuilt.doc).toEqual(parsed.doc);
  });
});

describe('risum preservation', () => {
  test('keeps encoded asset blocks identical after text edits', () => {
    const codec = formats.registry.risum;
    const parsed = codec.parse(fixture('sample.risum'), 'sample.risum');
    parsed.doc.module.module.description = 'Edited description';
    const built = codec.build(parsed.doc, parsed.preserved);
    const second = codec.parse(built, 'sample.risum');
    expect(second.doc).toEqual(parsed.doc);
    expect(second.preserved.entries).toEqual(parsed.preserved.entries);
    const originalBlock = parsed.preserved.entries[0].bytes;
    expect(built.slice(built.length - 1 - originalBlock.length, -1)).toEqual(originalBlock);
  });

  test('forbids metadata/reference changes including removal of an empty array', () => {
    const codec = formats.registry.risum;
    const parsed = codec.parse(fixture('sample.risum'), 'sample.risum');
    parsed.doc.module.module.assets![0][0] = 'changed';
    expectCode(() => codec.build(parsed.doc, parsed.preserved), 'asset-reference-changed');
    const empty = { kind: 'risum' as const, module: { type: 'risuModule' as const,
      module: { name: 'Empty', description: '', id: 'empty', assets: [] } } };
    const body = encodeRPack(json(empty.module));
    const bytes = new Uint8Array(body.length + 7);
    bytes[0] = 111;
    new DataView(bytes.buffer).setUint32(2, body.length, true);
    bytes.set(body, 6);
    const noAssets = codec.parse(bytes, 'empty.risum');
    delete noAssets.doc.module.module.assets;
    expectCode(() => codec.build(noAssets.doc, noAssets.preserved), 'asset-reference-changed');
  });
});

describe('charx', () => {
  const codec = formats.registry.charx;

  test('compresses large text entries without changing their uncompressed bytes', () => {
    const files = unzipSync(fixture('sample-no-module.charx'));
    files['notes/large.txt'] = strToU8('반복되는 긴 텍스트와 알 수 없는 ZIP 항목을 그대로 보존해요.\n'.repeat(4096));
    const stored = zipSync(files, { level: 0 });
    const parsed = codec.parse(stored, 'large.charx');
    const built = codec.build(parsed.doc, parsed.preserved);
    expect(built.byteLength).toBeLessThan(stored.byteLength);
    expect(unzipSync(built)['notes/large.txt']).toEqual(files['notes/large.txt']);
    const reparsed = codec.parse(built, 'large.charx');
    expect(reparsed.doc).toEqual(parsed.doc);
    expect(reparsed.preserved.entries).toEqual(parsed.preserved.entries);
  });

  test('native CCv3 entries are editable without synthesizing module.risum', () => {
    const parsed = codec.parse(fixture('sample-no-module.charx'), 'native.charx');
    expect(parsed.doc.module).toBeNull();
    parsed.doc.card.data.character_book!.entries![0].content = 'Native card edit';
    const built = codec.build(parsed.doc, parsed.preserved);
    expect(Object.keys(unzipSync(built))).not.toContain('module.risum');
    expect(codec.parse(built, 'native.charx').doc).toEqual(parsed.doc);
    expect(formats.getAvailableTabs(parsed.doc)).toEqual(['card', 'lorebook']);
  });

  test('JPEG prefix is retained, even with misleading PK bytes inside it', () => {
    const zip = fixture('sample.charx');
    const prefix = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x50, 0x4b, 3, 4, 7, 0xff, 0xd9]);
    const bytes = new Uint8Array(prefix.length + zip.length);
    bytes.set(prefix);
    bytes.set(zip, prefix.length);
    expect(formats.detectKind('card.jpeg', bytes)).toBe('charx');
    const parsed = codec.parse(bytes, 'card.jpeg');
    const built = codec.build(parsed.doc, parsed.preserved);
    expect(built.slice(0, prefix.length)).toEqual(prefix);
    roundTrip('card.jpeg', bytes);
  });

  test('regenerates only book entries from module lorebook and never mutates inputs', () => {
    const parsed = codec.parse(fixture('sample.charx'), 'sample.charx');
    const lore = parsed.doc.module!.module.lorebook![0];
    lore.content = 'New content';
    lore.key = 'one, two';
    lore.selective = true;
    lore.secondkey = 'three, four';
    lore.activationPercent = 42;
    lore.loreCache = { key: 'cached', data: ['text'] };
    lore.extentions!.risu_case_sensitive = true;
    const book = parsed.doc.card.data.character_book!;
    book.unknownSetting = { keep: true };
    book.entries![0].unknownEntryField = 'keep';
    book.entries![0].extensions!.futureExtension = 'keep';
    const before = structuredClone(parsed);
    const built = codec.build(parsed.doc, parsed.preserved);
    expect(parsed).toEqual(before);
    const rebuilt = codec.parse(built, 'sample.charx');
    expect(rebuilt.doc.module).toEqual(parsed.doc.module);
    expect(rebuilt.doc.card.data.character_book).toMatchObject({
      scan_depth: book.scan_depth,
      token_budget: book.token_budget,
      extensions: book.extensions,
      unknownSetting: { keep: true },
    });
    expect(rebuilt.doc.card.data.character_book!.entries![0]).toMatchObject({
      content: 'New content', keys: ['one', 'two'], secondary_keys: ['three', 'four'],
      case_sensitive: true, unknownEntryField: 'keep',
      extensions: { risu_activationPercent: 42, risu_loreCache: lore.loreCache, futureExtension: 'keep' },
    });
    expect(rebuilt.preserved.entries).toEqual(parsed.preserved.entries);
  });

  test('unknown fields follow stable lore IDs across reordering', () => {
    const parsed = codec.parse(fixture('sample.charx'), 'sample.charx');
    parsed.doc.card.data.character_book!.entries![0].future = 'belongs to lore-0001';
    parsed.doc.module!.module.lorebook!.reverse();
    const rebuilt = codec.parse(codec.build(parsed.doc, parsed.preserved), 'sample.charx');
    expect(rebuilt.doc.card.data.character_book!.entries![2].future).toBe('belongs to lore-0001');
  });

  test('retains original ZIP order and all opaque entries', () => {
    const parsed = codec.parse(fixture('sample.charx'), 'sample.charx');
    const built = codec.build(parsed.doc, parsed.preserved);
    const before = unzipSync(fixture('sample.charx'));
    const after = unzipSync(built);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const name of Object.keys(before).filter((name) => !['card.json', 'module.risum'].includes(name))) {
      expect(after[name]).toEqual(before[name]);
    }
  });

  test('rejects card asset-reference changes and adding a missing module', () => {
    const parsed = codec.parse(fixture('sample.charx'), 'sample.charx');
    parsed.doc.card.data.assets![0].uri = 'embeded://wrong.png';
    expectCode(() => codec.build(parsed.doc, parsed.preserved), 'asset-reference-changed');
    const native = codec.parse(fixture('sample-no-module.charx'), 'native.charx');
    native.doc.module = parsed.doc.module;
    expectCode(() => codec.build(native.doc, native.preserved), 'preserved-payload-mismatch');
  });
});

describe('public API and errors', () => {
  test('detectKind follows charx -> risum -> lorebook precedence', () => {
    expect(formats.detectKind('ambiguous.json', fixture('sample.charx'))).toBe('charx');
    expect(formats.detectKind('ambiguous.json', fixture('sample.risum'))).toBe('risum');
    expect(formats.detectKind('ambiguous.charx', fixture('sample.risum'))).toBe('charx');
    expect(formats.detectKind('book.bin', fixture('sample.lorebook.json'))).toBe('lorebook');
    expect(formats.detectKind('unknown.bin', new Uint8Array())).toBeNull();
    expect(formats.detectKind('ordinary.txt', strToU8('ordinary text'))).toBeNull();
    expect(formats.detectKind('ordinary.json', strToU8('ordinary text'))).toBe('lorebook');
    expect(formats.registry.risum.detect('ordinary.txt', new Uint8Array([111]))).toBe(false);
    expect(formats.registry.risum.detect('module.bin', new Uint8Array([111, 0]))).toBe(true);
    expect(formats.detectKind('image.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  test('tabs are fixed per kind and module presence', () => {
    expect(formats.getAvailableTabs(formats.registry.charx.parse(fixture('sample.charx'), 'card.charx').doc))
      .toEqual(['card', 'module', 'lorebook', 'regex', 'trigger']);
    expect(formats.getAvailableTabs(formats.registry.risum.parse(fixture('sample.risum'), 'module.risum').doc))
      .toEqual(['module', 'lorebook', 'regex', 'trigger']);
    expect(formats.getAvailableTabs(formats.registry.lorebook.parse(fixture('sample.lorebook.json'), 'book.json').doc))
      .toEqual(['lorebook']);
  });

  test('invalid JSON and un-addressable lorebooks have distinct codes', () => {
    const codec = formats.registry.lorebook;
    expectCode(() => codec.parse(strToU8('{'), 'bad.json'), 'invalid-json');
    expectCode(() => codec.parse(new Uint8Array([0xff]), 'bad.json'), 'invalid-json');
    expectCode(() => codec.parse(json(null), 'bad.json'), 'missing-required-data');
    expectCode(() => codec.parse(json({ type: 'risu', ver: 1, data: 'bad' }), 'bad.json'), 'missing-required-data');
  });

  test('invalid risum headers, versions, lengths, markers and terminators', () => {
    const codec = formats.registry.risum;
    const valid = fixture('sample.risum');
    expectCode(() => codec.parse(new Uint8Array(), 'bad.risum'), 'invalid-container');
    const badMagic = valid.slice(); badMagic[0] = 0;
    expectCode(() => codec.parse(badMagic, 'bad.risum'), 'invalid-container');
    const badVersion = valid.slice(); badVersion[1] = 1;
    expectCode(() => codec.parse(badVersion, 'bad.risum'), 'unsupported-version');
    const badLength = valid.slice(); new DataView(badLength.buffer).setUint32(2, 0xffffffff, true);
    expectCode(() => codec.parse(badLength, 'bad.risum'), 'invalid-container');
    const badMarker = valid.slice(); badMarker[6 + new DataView(valid.buffer).getUint32(2, true)] = 2;
    expectCode(() => codec.parse(badMarker, 'bad.risum'), 'invalid-container');
    expectCode(() => codec.parse(valid.slice(0, -1), 'bad.risum'), 'invalid-container');
  });

  test('charx reports invalid container, missing card and un-addressable data', () => {
    const codec = formats.registry.charx;
    expectCode(() => codec.parse(new Uint8Array([0x50, 0x4b, 3, 4]), 'bad.charx'), 'invalid-container');
    expectCode(() => codec.parse(zipSync({ 'other.txt': strToU8('text') }), 'bad.charx'), 'missing-required-data');
    expectCode(() => codec.parse(zipSync({ 'card.json': json({ spec: 'chara_card_v3', data: [] }) }), 'bad.charx'), 'missing-required-data');
    expectCode(() => codec.parse(zipSync({ 'card.json': strToU8('{') }), 'bad.charx'), 'invalid-json');
  });

  test('build rejects incorrect document and preserved kinds', () => {
    const risum = formats.registry.risum.parse(fixture('sample.risum'), 'sample.risum');
    const lorebook = formats.registry.lorebook.parse(fixture('sample.lorebook.json'), 'sample.json');
    const codec = formats.registry.risum as unknown as FormatCodec;
    expectCode(() => codec.build(lorebook.doc, risum.preserved), 'document-kind-mismatch');
    expectCode(() => codec.build(risum.doc, lorebook.preserved), 'preserved-payload-mismatch');
  });

  test('validation reports structural errors and nonblocking warnings without mutation', () => {
    const parsed = formats.registry.lorebook.parse(fixture('sample.lorebook.json'), 'sample.json');
    parsed.doc.book.data[0].mode = 'future-mode';
    parsed.doc.book.data[0].activationPercent = 200;
    const before = structuredClone(parsed.doc);
    expect(formats.validate(parsed.doc)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', path: '/book/data/0/mode' }),
      expect.objectContaining({ severity: 'warning', path: '/book/data/0/activationPercent' }),
    ]));
    expect(formats.validate(parsed.doc).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(parsed.doc).toEqual(before);
    const invalid = { kind: 'lorebook', book: { type: 'risu', ver: 1, data: 'not an array' } } as unknown as EditableDocument;
    expect(formats.validate(invalid)).toContainEqual(expect.objectContaining({ severity: 'error', path: '/book/data' }));
    const binary = { ...parsed.doc, 'future/key~': new Uint8Array([1]) } as unknown as EditableDocument;
    expect(formats.validate(binary)).toContainEqual(expect.objectContaining({ severity: 'error', path: '/future~1key~0' }));
  });
});

describe('tolerant import and export validation', () => {
  test('scalar type drift and missing optional-ish module fields import unchanged', () => {
    const envelope = { type: 'risuModule', module: { name: 123, id: null, regex: [{ in: 42 }] }, future: true };
    const parsed = formats.registry.risum.parse(risumBytes(envelope), 'older.risum');
    expect(parsed.doc.module).toEqual(envelope);
    expect(formats.validate(parsed.doc)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', path: '/module/module/name' }),
      expect.objectContaining({ severity: 'warning', path: '/module/module/description' }),
      expect.objectContaining({ severity: 'warning', path: '/module/module/id' }),
      expect.objectContaining({ severity: 'warning', path: '/module/module/regex/0/in' }),
    ]));
    expect(formats.validate(parsed.doc).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(formats.registry.risum.parse(formats.registry.risum.build(parsed.doc, parsed.preserved), 'older.risum').doc)
      .toEqual(parsed.doc);
  });

  test('optional card scalar types and missing lorebook ver import without normalization', () => {
    const card = { spec: 'chara_card_v3', data: { description: 123, tags: false, extensions: {} } };
    const parsed = formats.registry.charx.parse(zipSync({ 'card.json': json(card) }), 'other-tool.charx');
    expect(parsed.doc.card).toEqual(card);
    expect(formats.validate(parsed.doc)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', path: '/card/data/description' }),
      expect.objectContaining({ severity: 'warning', path: '/card/data/tags' }),
    ]));
    expect(formats.validate(parsed.doc).filter((issue) => issue.severity === 'error')).toEqual([]);
    const book = { type: 'risu', data: [{ key: 123, content: false }], unknown: 'keep' };
    const lore = formats.registry.lorebook.parse(json(book), 'older.json');
    expect(lore.doc.book).toEqual(book);
    expect(formats.validate(lore.doc)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', path: '/book/ver' }),
      expect.objectContaining({ severity: 'warning', path: '/book/data/0/key' }),
      expect.objectContaining({ severity: 'warning', path: '/book/data/0/content' }),
    ]));
    expect(formats.validate(lore.doc).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  test('addressable data with fatal export fields imports but build is blocked', () => {
    const card = { spec: 'chara_card_v3', data: {} };
    const envelope = { type: 'risuModule', module: {
      lorebook: [{ key: 123, content: 'kept', selective: true }],
    } };
    const parsed = formats.registry.charx.parse(zipSync({
      'card.json': json(card), 'module.risum': risumBytes(envelope),
    }), 'repairable.charx');
    expect(parsed.doc.card).toEqual(card);
    expect(parsed.doc.module).toEqual(envelope);
    expect(formats.validate(parsed.doc)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', path: '/module/module/lorebook/0/key' }),
      expect.objectContaining({ severity: 'error', path: '/module/module/lorebook/0/secondkey' }),
      expect.objectContaining({ severity: 'warning', path: '/module/module/description' }),
    ]));
    expectCode(() => formats.registry.charx.build(parsed.doc, parsed.preserved), 'missing-required-data');
  });

  test('schema discriminators and missing collections are validated after import', () => {
    const book = formats.registry.lorebook.parse(json({ type: 'regex', ver: 1, data: [] }), 'other.json');
    expect(formats.validate(book.doc)).toContainEqual(expect.objectContaining({ severity: 'error', path: '/book/type' }));
    const missingData = formats.registry.lorebook.parse(json({ type: 'risu' }), 'incomplete.json');
    expect(formats.validate(missingData.doc)).toContainEqual(expect.objectContaining({ severity: 'error', path: '/book/data' }));
    const module = formats.registry.risum.parse(risumBytes({ type: 'future', module: {} }), 'future.risum');
    expect(formats.validate(module.doc)).toContainEqual(expect.objectContaining({ severity: 'error', path: '/module/type' }));
    const card = formats.registry.charx.parse(zipSync({ 'card.json': json({ spec: 'chara_card_v2', data: {} }) }), 'older.charx');
    expect(formats.validate(card.doc)).toContainEqual(expect.objectContaining({ severity: 'error', path: '/card/spec' }));
  });

  test('nonobject roots, modules, collection values and items cannot be addressed', () => {
    const codec = formats.registry.risum;
    for (const envelope of [null, [], { module: null }, { module: [] },
      { module: { lorebook: {} } }, { module: { regex: [null] } },
      { module: { trigger: [{ conditions: 'bad' }] } }, { module: { trigger: [{ effect: [42] }] } }]) {
      expectCode(() => codec.parse(risumBytes(envelope), 'bad.risum'), 'missing-required-data');
    }
    expectCode(() => formats.registry.lorebook.parse(json({ type: 'risu', data: [null] }), 'bad.json'), 'missing-required-data');
    expectCode(() => formats.registry.charx.parse(zipSync({ 'card.json': json(null) }), 'bad.charx'), 'missing-required-data');
    expectCode(() => formats.registry.charx.parse(zipSync({ 'card.json': json({ data: {
      character_book: { entries: ['bad'] },
    } }) }), 'bad.charx'), 'missing-required-data');
  });

  test('native card join/startsWith failures are export errors rather than import rejections', () => {
    const raw = { spec: 'chara_card_v3', data: { extensions: {}, assets: [{ uri: 42 }], character_book: {
      entries: [{ keys: 'bad' }, { keys: [42], use_regex: true, secondary_keys: 42 }],
    } } };
    const parsed = formats.registry.charx.parse(zipSync({ 'card.json': json(raw) }), 'repairable.charx');
    expect(parsed.doc.card).toEqual(raw);
    expect(formats.validate(parsed.doc)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', path: '/card/data/assets/0/uri' }),
      expect.objectContaining({ severity: 'error', path: '/card/data/character_book/entries/0/keys' }),
      expect.objectContaining({ severity: 'error', path: '/card/data/character_book/entries/1/keys/0' }),
      expect.objectContaining({ severity: 'error', path: '/card/data/character_book/entries/1/secondary_keys' }),
    ]));
  });

  test('risum block/reference count drift is kept on import and caught by build', () => {
    const bytes = risumBytes({ type: 'risuModule', module: { assets: [['missing', '', 'png']] } });
    const parsed = formats.registry.risum.parse(bytes, 'repairable.risum');
    expect(parsed.doc.module.module.assets).toEqual([['missing', '', 'png']]);
    expectCode(() => formats.registry.risum.build(parsed.doc, parsed.preserved), 'preserved-payload-mismatch');
  });
});

const realDirectory = fileURLToPath(new URL('./fixtures/real/', import.meta.url));
const realFiles = existsSync(realDirectory) ? readdirSync(realDirectory).filter((name) => /\.(charx|risum|json|lorebook|jpe?g)$/i.test(name)) : [];
describe('real RisuAI fixtures', () => {
  if (realFiles.length === 0) {
    test.skip('no real fixtures supplied yet', () => {});
  } else {
    test.each(realFiles)('%s round-trips JSON and preserved binaries', (name) => {
      roundTrip(name, new Uint8Array(readFileSync(`${realDirectory}/${name}`)));
    });
  }
});
