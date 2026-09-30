// Container reference: kwaroran/RisuAI src/ts/process/processzip.ts,
// CharXImporter / CharXWriter, and src/ts/characterCards.ts L81-165
// (main @ f9728b1, GPL-3.0). Unlike its importer, retain ALL other ZIP entries.
import { strFromU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { FormatError } from '$contracts';
import type {
  CharacterBookEntry, CharacterCardV3, FormatCodec, JsonObject,
  LoreBookEntry, PreservedEntry, PreservedPayload,
} from '$contracts';
import { risum } from './risum';
import {
  assertAddressable, assertAssetReferences, assertDocument, assertPreserved, cloneJson, concatBytes,
  equalJson, isObject, jsonBytes, parseJson, preserve,
} from './shared';

const schema = 'solene-charx-v1';
const compressedExtension = /\.(png|jpe?g|webp|gif|avif|mp3|ogg|opus|flac|aac|m4a|mp4|m4v|webm|zip|gz|bz2|xz|7z|rar|woff2)$/i;

interface ZipLayout {
  base: number;
  prefixLength: number;
  order: string[];
}

/** Read ZIP32 central offsets instead of searching JPEG data for a PK byte pattern. */
function zipLayout(bytes: Uint8Array): ZipLayout {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalid = () => new FormatError('invalid-container', 'ZIP 디렉터리나 헤더가 올바르지 않아요.');
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < Math.max(0, bytes.length - 65557)) throw invalid();
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw invalid();
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    throw new FormatError('unsupported-version', 'ZIP64 charx는 아직 지원하지 않아요.');
  }
  if (view.getUint16(end + 8, true) !== count) throw invalid();
  const start = end - size;
  const base = start - offset;
  if (start < 0 || base < 0) throw invalid();
  let position = start;
  const entries: { name: string; local: number }[] = [];
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(position + 8, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const next = position + 46 + nameLength + extraLength + commentLength;
    if (next > end || (flags & 1) !== 0 || view.getUint16(position + 34, true) !== 0) throw invalid();
    const name = strFromU8(bytes.subarray(position + 46, position + 46 + nameLength), (flags & 0x800) === 0);
    const local = base + view.getUint32(position + 42, true);
    if (names.has(name) || local < base || local + 30 > start || view.getUint32(local, true) !== 0x04034b50) throw invalid();
    const localNameLength = view.getUint16(local + 26, true);
    const dataStart = local + 30 + localNameLength + view.getUint16(local + 28, true);
    const compressedSize = view.getUint32(position + 20, true);
    if (dataStart + compressedSize > start || compressedSize === 0xffffffff) throw invalid();
    const localName = strFromU8(bytes.subarray(local + 30, local + 30 + localNameLength), (flags & 0x800) === 0);
    if (localName !== name) throw invalid();
    names.add(name);
    entries.push({ name, local });
    position = next;
  }
  if (position !== end) throw invalid();
  entries.sort((a, b) => a.local - b.local);
  const prefixLength = entries[0]?.local ?? base;
  if (prefixLength > 0 && (bytes[0] !== 0xff || bytes[1] !== 0xd8)) throw invalid();
  return { base, prefixLength, order: entries.map((entry) => entry.name) };
}

/** Synchronous fflate streams preserve insertion order even for numeric filenames. */
function writeZip(entries: readonly PreservedEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else chunks.push(data);
  });
  try {
    for (const entry of entries) {
      const file = compressedExtension.test(entry.name)
        ? new ZipPassThrough(entry.name)
        : new ZipDeflate(entry.name, { level: 6 });
      zip.add(file);
      file.push(entry.bytes, true);
    }
    zip.end();
    if (failure) throw failure;
    return concatBytes(chunks);
  } catch (cause) {
    throw new FormatError('invalid-container', 'ZIP을 만들 수 없어요.', { cause });
  }
}

/** Port: RisuAI src/ts/characterCards.ts L1571-1600, GPL-3.0 @ f9728b1. */
function cardBookEntry(lore: LoreBookEntry, previous: CharacterBookEntry | undefined): CharacterBookEntry {
  const extensions: JsonObject = { ...previous?.extensions };
  delete extensions.risu_case_sensitive;
  Object.assign(extensions, cloneJson(lore.extentions ?? {}));
  const caseSensitive = lore.extentions?.risu_case_sensitive ?? false;
  extensions.risu_activationPercent = lore.activationPercent;
  extensions.risu_loreCache = lore.loreCache;
  // Known fields follow RisuAI; nonconflicting unknown fields stay from previous.
  return cloneJson({
    ...previous,
    keys: lore.key.split(',').map((key) => key.trim()),
    secondary_keys: lore.selective ? lore.secondkey.split(',').map((key) => key.trim()) : undefined,
    content: lore.content,
    extensions,
    enabled: true,
    insertion_order: lore.insertorder,
    constant: lore.alwaysActive,
    selective: lore.selective,
    name: lore.comment,
    comment: lore.comment,
    case_sensitive: caseSensitive,
    use_regex: lore.useRegex ?? false,
    mode: lore.mode ?? 'normal',
    folder: lore.folder,
  });
}

/** Keep unknown CCv3 fields attached to an original Risu entry when it moves. */
function provenanceIndex(lore: LoreBookEntry, index: number, originals: LoreBookEntry[], count: number): number {
  if (typeof lore.id === 'string') {
    const matches = originals.flatMap((entry, originalIndex) => entry.id === lore.id ? [originalIndex] : []);
    if (matches.length === 1) return matches[0];
  }
  const unchanged = originals.findIndex((entry) => equalJson(entry, lore));
  if (unchanged >= 0) return unchanged;
  const matches = originals.flatMap((entry, originalIndex) =>
    entry.key === lore.key && entry.comment === lore.comment ? [originalIndex] : []);
  if (matches.length === 1) return matches[0];
  return originals.length === count ? index : -1;
}

function extraCardReferences(card: CharacterCardV3): JsonObject {
  const risu = card.data.extensions?.risuai;
  return isObject(risu) ? {
    emotions: risu.emotions ?? null,
    additionalAssets: risu.additionalAssets ?? null,
    vits: risu.vits ?? null,
  } : { emotions: null, additionalAssets: null, vits: null };
}

function entryAt(payload: PreservedPayload, index: unknown): PreservedEntry {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || !payload.entries[index]) {
    throw new FormatError('preserved-payload-mismatch', '보관된 ZIP 항목을 찾을 수 없어요.');
  }
  return payload.entries[index];
}

export const charx: FormatCodec<'charx'> = {
  kind: 'charx',
  detect(fileName, bytes) {
    if (/\.charx$/i.test(fileName) || (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4)) return true;
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
    try { zipLayout(bytes); return true; } catch { return false; }
  },
  parse(bytes) {
    let layout: ZipLayout;
    let files: Record<string, Uint8Array>;
    try {
      layout = zipLayout(bytes);
      files = unzipSync(bytes.subarray(layout.base));
    } catch (cause) {
      if (cause instanceof FormatError) throw cause;
      throw new FormatError('invalid-container', 'charx ZIP을 읽을 수 없어요.', { cause });
    }
    if (!layout.order.includes('card.json')) throw new FormatError('missing-required-data', 'card.json이 없어요.');
    const card = parseJson(files['card.json']);
    const moduleResult = layout.order.includes('module.risum') ? risum.parse(files['module.risum'], 'module.risum') : null;
    const doc = { kind: 'charx' as const, card: card as CharacterCardV3, module: moduleResult?.doc.module ?? null };
    assertAddressable(doc, 'charx');
    const entries: PreservedEntry[] = [];
    const prefixIndex = layout.prefixLength > 0 ? 0 : null;
    if (prefixIndex !== null) entries.push({ name: 'charx:jpeg-prefix', bytes: bytes.slice(0, layout.prefixLength) });
    const zipEntries: JsonObject[] = [];
    for (const name of layout.order) {
      if (name === 'card.json' || name === 'module.risum') continue;
      if (!(files[name] instanceof Uint8Array)) throw new FormatError('invalid-container', 'ZIP 항목을 읽을 수 없어요.');
      zipEntries.push({ name, index: entries.length });
      entries.push({ name, bytes: files[name].slice() });
    }
    const moduleIndices: number[] = [];
    for (const entry of moduleResult?.preserved.entries ?? []) {
      moduleIndices.push(entries.length);
      entries.push({ name: `module.risum/${entry.name}`, bytes: entry.bytes });
    }
    return {
      doc,
      preserved: preserve('charx', entries, {
        schema,
        order: layout.order,
        prefixIndex,
        zipEntries,
        moduleIndices,
        moduleMetadata: moduleResult?.preserved.metadata ?? null,
        cardAssets: cloneJson(doc.card.data.assets ?? null),
        extraCardReferences: cloneJson(extraCardReferences(doc.card)),
        originalLorebook: cloneJson(doc.module?.module.lorebook ?? []),
      }),
    };
  },
  build(doc, preserved) {
    assertDocument(doc, 'charx');
    assertPreserved(preserved, 'charx', schema);
    const metadata = preserved.metadata;
    assertAssetReferences(doc.card.data.assets, metadata.cardAssets);
    assertAssetReferences(extraCardReferences(doc.card), metadata.extraCardReferences);
    if (!Array.isArray(metadata.order) || !metadata.order.every((name) => typeof name === 'string') ||
        !Array.isArray(metadata.zipEntries) || !Array.isArray(metadata.moduleIndices) ||
        !Array.isArray(metadata.originalLorebook) ||
        (doc.module === null) !== (metadata.moduleMetadata === null)) {
      throw new FormatError('preserved-payload-mismatch', 'charx 보존 메타데이터가 맞지 않아요.');
    }
    const card = cloneJson(doc.card);
    const output = new Map<string, Uint8Array>();
    if (doc.module !== null) {
      if (!isObject(metadata.moduleMetadata)) throw new FormatError('preserved-payload-mismatch', 'module 보존 메타데이터가 없어요.');
      const modulePayload = preserve('risum', metadata.moduleIndices.map((index, position) => ({
        name: `risum:block:${position}`, bytes: entryAt(preserved, index).bytes,
      })), metadata.moduleMetadata);
      output.set('module.risum', risum.build({ kind: 'risum', module: doc.module }, modulePayload));
      const lorebook = doc.module.module.lorebook ?? [];
      const previous = card.data.character_book?.entries ?? [];
      const originals = metadata.originalLorebook as LoreBookEntry[];
      const regenerated = lorebook.map((lore, index) =>
        cardBookEntry(lore, previous[provenanceIndex(lore, index, originals, lorebook.length)]));
      // Keep an untouched, absent book absent if no entries need to be emitted.
      if (card.data.character_book !== undefined || regenerated.length > 0) {
        card.data.character_book = { ...card.data.character_book, entries: regenerated };
      }
    }
    output.set('card.json', jsonBytes(card, 4));
    for (const record of metadata.zipEntries) {
      if (!isObject(record) || typeof record.name !== 'string' || output.has(record.name)) {
        throw new FormatError('preserved-payload-mismatch', 'ZIP 항목 메타데이터가 맞지 않아요.');
      }
      output.set(record.name, entryAt(preserved, record.index).bytes);
    }
    if (new Set(metadata.order).size !== metadata.order.length || metadata.order.length !== output.size ||
        !metadata.order.every((name) => typeof name === 'string' && output.has(name))) {
      throw new FormatError('preserved-payload-mismatch', 'ZIP 항목 순서가 맞지 않아요.');
    }
    const zip = writeZip(metadata.order.map((name) => ({ name: name as string, bytes: output.get(name as string)! })));
    return metadata.prefixIndex === null ? zip : concatBytes([entryAt(preserved, metadata.prefixIndex).bytes, zip]);
  },
};
