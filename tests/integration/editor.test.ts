import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EditableDocument, EditorStores, Storage } from '$contracts';
import { formats } from '../../src/formats';
import { createStorage } from '../../src/storage';
import { createServices } from '../../src/services';
import { newId, readFile, sha256Hex } from '../../src/services/adapters';
import { createEditorStores } from '../../src/stores';

const syntheticDirectory = fileURLToPath(new URL('../fixtures/synthetic/', import.meta.url));
const realDirectory = fileURLToPath(new URL('../fixtures/real/', import.meta.url));
const syntheticFiles = readdirSync(syntheticDirectory).sort();
const activeStores = new Set<EditorStores>();
const editedContent = '통합 테스트에서 바꾼 내용이에요.\n한글과 🗡️도 보존해요.';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const settings = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => settings.get(key) ?? null,
    setItem: (key: string, value: string) => { settings.set(key, value); },
  });
});

afterEach(async () => {
  try {
    await Promise.all([...activeStores].map(stores => stores.dispose()));
  } finally {
    activeStores.clear();
    vi.unstubAllGlobals();
  }
});

function fixture(name: string, directory = syntheticDirectory) {
  const bytes = new Uint8Array(readFileSync(join(directory, name)));
  // Vitest's Node environment uses Node 24's native File and arrayBuffer().
  return { bytes, file: new File([bytes], name) };
}

function parse(name: string, bytes: Uint8Array) {
  const kind = formats.detectKind(name, bytes);
  if (!kind) throw new Error(`Could not detect fixture: ${name}`);
  return formats.registry[kind].parse(bytes, name);
}

async function editor(storage?: Storage) {
  storage ??= await createStorage();
  await storage.setSettings({ ...await storage.getSettings(), snapshotIntervalMin: 0 });
  const downloads: { name: string; bytes: Uint8Array }[] = [];
  const services = createServices({
    storage, formats, now: Date.now, newId, sha256Hex,
    download: async (name, bytes) => { downloads.push({ name, bytes: bytes.slice() }); },
  });
  const stores = createEditorStores({ storage, services, formats, readFile });
  activeStores.add(stores);
  await stores.initialize();
  return { storage, stores, downloads };
}

function currentDoc(stores: EditorStores): EditableDocument {
  const record = get(stores.workspace).record;
  if (!record) throw new Error('Expected an imported workspace');
  return structuredClone(record.doc) as EditableDocument;
}

function editLorebook(stores: EditorStores) {
  const doc = currentDoc(stores);
  if (doc.kind === 'charx' && !doc.module) {
    const entry = doc.card.data.character_book?.entries?.[0];
    if (!entry) throw new Error('Expected a native character-book entry');
    stores.updateItem({ tab: 'lorebook', format: 'character-book', index: 0 }, {
      ...entry, content: editedContent, futureIntegrationField: { nested: [true, null, '보존'] },
    });
  } else {
    const entry = doc.kind === 'lorebook' ? doc.book.data[0] : doc.module?.module.lorebook?.[0];
    if (!entry) throw new Error('Expected a Risu lorebook entry');
    stores.updateItem({ tab: 'lorebook', format: 'risu', index: 0 }, {
      ...entry, content: editedContent, futureIntegrationField: { nested: [true, null, '보존'] },
    });
  }
}

function expectedEdit(original: EditableDocument): EditableDocument {
  const expected = structuredClone(original);
  const entry = expected.kind === 'lorebook' ? expected.book.data[0]
    : expected.kind === 'charx' && !expected.module ? expected.card.data.character_book!.entries![0]
      : expected.module!.module.lorebook![0];
  entry.content = editedContent;
  entry.futureIntegrationField = { nested: [true, null, '보존'] };
  if (expected.kind === 'charx' && expected.module) {
    expected.card.data.character_book!.entries![0].content = editedContent;
  }
  return expected;
}

describe('all layers: synthetic import, edit, and export', () => {
  test.each(syntheticFiles)('%s preserves unknown JSON and binary entries after an edit', async name => {
    const { bytes, file } = fixture(name);
    const original = parse(name, bytes);
    const { stores, downloads } = await editor();
    await stores.requestImport(file);
    expect(currentDoc(stores)).toEqual(original.doc);
    expect(get(stores.status).dirty).toBe(false);

    editLorebook(stores);
    expect(get(stores.status).dirty).toBe(true);
    expect((await stores.exportFile()).status).toBe('exported');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe(name);

    const reparsed = parse(name, downloads[0].bytes);
    // Exact equality covers every untouched field, including unknown root/nested keys.
    expect(reparsed.doc).toEqual(expectedEdit(original.doc));
    expect(reparsed.preserved.entries).toEqual(original.preserved.entries);
    expect(get(stores.status).dirty).toBe(false);
    if (reparsed.doc.kind === 'charx' && reparsed.doc.module) {
      const card = JSON.parse(new TextDecoder().decode(unzipSync(downloads[0].bytes)['card.json']));
      expect(card.data.character_book.entries[0].content).toBe(editedContent);
      expect(reparsed.doc.module.module.lorebook![0].content).toBe(editedContent);
    }
  });
});

describe('all layers: workspace lifecycle', () => {
  test.each([false, true])('confirms replacement when dirty=%s; cancel retains work and continue resets snapshots', async dirty => {
    const { stores, storage } = await editor();
    await stores.requestImport(fixture('sample.charx').file);
    if (dirty) editLorebook(stores);
    await stores.takeManualSnapshot('남겨 둘 작업');
    const previous = structuredClone(get(stores.workspace).record);
    const previousSnapshots = await storage.listSnapshots();
    const previousPayload = await storage.getPreserved();
    const next = fixture('sample.risum');

    await stores.requestImport(next.file);
    expect(get(stores.ui).openDialog).toEqual({ kind: 'import-confirm', fileName: next.file.name });
    expect(get(stores.workspace).record).toEqual(previous);
    await stores.confirmImport('cancel');
    expect(get(stores.ui).openDialog).toBeNull();
    expect(get(stores.workspace).record).toEqual(previous);
    expect(await storage.listSnapshots()).toEqual(previousSnapshots);
    expect(await storage.getPreserved()).toEqual(previousPayload);

    await stores.requestImport(next.file);
    await stores.confirmImport('continue');
    const parsed = parse(next.file.name, next.bytes);
    expect(currentDoc(stores)).toEqual(parsed.doc);
    expect(get(stores.workspace).record?.fileName).toBe(next.file.name);
    expect(get(stores.status).dirty).toBe(false);
    const snapshots = await storage.listSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ reason: 'original', pinned: true, doc: parsed.doc });
    expect(get(stores.snapshots)).toEqual(snapshots);
    expect(await storage.getPreserved()).toEqual(parsed.preserved);
    expect((await storage.getWorkspace())?.doc).toEqual(parsed.doc);
  });

  test('restores a manual snapshot, marks dirty, and saves the state before restoring', async () => {
    const { stores, storage, downloads } = await editor();
    await stores.requestImport(fixture('sample.charx').file);
    const manual = await stores.takeManualSnapshot('복원할 버전');
    expect(manual).toMatchObject({ reason: 'manual', pinned: true });
    const payload = await storage.getPreserved();
    editLorebook(stores);
    const edited = currentDoc(stores);
    await stores.restoreSnapshot(manual.id);
    expect(currentDoc(stores)).toEqual(manual.doc);
    expect(get(stores.status).dirty).toBe(true);
    expect((await storage.getWorkspace())?.dirty).toBe(true);
    const snapshots = await storage.listSnapshots();
    expect(snapshots.filter(snapshot => snapshot.reason === 'before-restore')).toEqual([
      expect.objectContaining({ doc: edited, pinned: false }),
    ]);
    expect(await storage.getPreserved()).toEqual(payload);
    expect((await stores.exportFile()).status).toBe('exported');
    const reparsed = parse(downloads[0].name, downloads[0].bytes);
    expect(reparsed.doc).toEqual(manual.doc);
    expect(reparsed.preserved.entries).toEqual(payload?.entries);
  });

  test('reloads the workspace and dirty flag through a fresh IndexedDB storage instance', async () => {
    const first = await editor();
    await first.stores.requestImport(fixture('sample.risum').file);
    editLorebook(first.stores);
    const expected = structuredClone(get(first.stores.workspace).record);
    await first.stores.dispose();
    activeStores.delete(first.stores);

    // Reopen the same database, so a memory-only fallback cannot pass this test.
    const second = await editor(await createStorage());
    expect(get(second.stores.workspace).record).toEqual(expected);
    expect(get(second.stores.status).dirty).toBe(true);
    expect(await second.storage.getPreserved()).toEqual(await first.storage.getPreserved());
    expect(get(second.stores.snapshots)).toEqual(await first.storage.listSnapshots());
    expect((await second.stores.exportFile()).status).toBe('exported');
    expect(parse(second.downloads[0].name, second.downloads[0].bytes).doc).toEqual(expected?.doc);
  });
});

function realFiles(directory: string, prefix = ''): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = join(prefix, entry.name);
    return entry.isDirectory() ? realFiles(join(directory, entry.name), relative)
      : /\.(charx|risum|json|jpe?g)$/i.test(entry.name) ? [relative] : [];
  }).sort();
}

describe('all layers: optional real fixtures', () => {
  const files = realFiles(realDirectory);
  if (files.length === 0) {
    test.skip('import, export, and re-parse real fixtures (none supplied)', () => {});
  }
  test.each(files)('%s round-trips through the editor', async name => {
    const { bytes, file } = fixture(name, realDirectory);
    const original = parse(name, bytes);
    const { stores, downloads } = await editor();
    await stores.requestImport(file);
    expect((await stores.exportFile()).status).toBe('exported');
    expect(downloads).toHaveLength(1);
    const reparsed = parse(name, downloads[0].bytes);
    expect(reparsed.doc).toEqual(original.doc);
    expect(reparsed.preserved.entries).toEqual(original.preserved.entries);
  });
});
