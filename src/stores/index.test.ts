import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStores } from './index';
import { createServices } from '../services';
import { context, deferred, document, entry, input, workspace } from '../services/test-helpers';
import type { CharacterCardData, EditableDocument, EditorStores, RisuModule, WorkspaceRecord } from '$contracts';

let stores: EditorStores;
const address = { tab: 'lorebook', format: 'risu', index: 0 } as const;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(async () => { if (stores) await stores.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

async function setup(initial: WorkspaceRecord | null = workspace()) {
  const ctx = context(initial);
  const services = createServices(ctx.deps);
  const readFile = vi.fn(async (): Promise<Uint8Array> => input().bytes);
  stores = createEditorStores({ storage: ctx.storage, formats: ctx.formats, services, readFile });
  await stores.initialize();
  return { ...ctx, services, readFile };
}
const file = (name = 'new.json') => ({ name } as File);
const record = () => get(stores.workspace).record!;

describe('editor commands', () => {
  it('shares unchanged frozen subtrees, keeps previous views unchanged, and detaches caller values', async () => {
    const doc = document();
    if (doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    doc.book.data.push(entry('unchanged'));
    await setup(workspace(doc));
    const before = record();
    if (before.doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    const callerUnknown = { keep: true };
    const value = { ...entry('changed'), unknownEntry: callerUnknown };
    stores.updateItem(address, value);
    const after = record();
    if (after.doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    expect(after).not.toBe(before);
    expect(after.doc.book.data).not.toBe(before.doc.book.data);
    expect(after.doc.book.data[1]).toBe(before.doc.book.data[1]);
    expect(before.doc.book.data[0].content).toBe('old');
    expect(after.doc.book.data[0].content).toBe('changed');
    expect(Object.isFrozen(after.doc.book.data)).toBe(true);
    expect(Object.isFrozen(after.doc.book.data[0].unknownEntry)).toBe(true);
    expect(Reflect.set(after.doc.book.data[1], 'content', 'outside mutation')).toBe(false);
    expect(Reflect.set(before.doc.book, 'ver', 99)).toBe(false);
    callerUnknown.keep = false;
    value.content = 'outside mutation';
    expect(after.doc.book.data[0]).toMatchObject({ content: 'changed', unknownEntry: { keep: true } });
    expect(Object.isFrozen(callerUnknown)).toBe(false);
  });

  it('selects first items, clones inputs, preserves unknown keys, adds/removes, and autosaves without clearing dirty', async () => {
    const ctx = await setup();
    expect(get(stores.workspace).tabs).toEqual(['lorebook']);
    expect(get(stores.ui)).toMatchObject({ activeTab: 'lorebook', selectedIndex: 0 });
    expect(stores.select('lorebook')).toBe(true);
    const value = entry('edited');
    stores.updateItem(address, value);
    value.content = 'outside mutation';
    expect(record().doc).toMatchObject({ book: { data: [entry('edited')], unknownRoot: true } });
    expect(stores.addItem({ tab: 'lorebook', format: 'risu' }, entry('added'))).toBe(1);
    expect(get(stores.ui).selectedIndex).toBe(1);
    stores.removeItem(address);
    expect(get(stores.ui).selectedIndex).toBe(0);
    stores.removeItem(address);
    expect(get(stores.ui).selectedIndex).toBeNull();
    expect(() => stores.select('lorebook', 1)).toThrow();
    expect(get(stores.status).error).not.toBeNull();
    stores.clearError();
    expect(get(stores.status).error).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await ctx.storage.getWorkspace())?.dirty).toBe(true);
    expect(get(stores.status).lastSavedAt).toBe(2000);
    expect(get(stores.status).dirty).toBe(true);
    expect(Object.isFrozen(record().doc)).toBe(true);
    expect('set' in stores.workspace).toBe(false);
  });

  it('validates addresses, rejects non-JSON and unknown-loss edits without mutation', async () => {
    await setup();
    const before = record();
    expect(() => stores.updateItem({ ...address, index: -1 }, entry())).toThrow();
    expect(() => stores.updateItem({ ...address, format: 'character-book' }, {})).toThrow();
    expect(() => stores.updateItem(address, { ...entry(), insertorder: Infinity })).toThrow();
    const value = entry();
    delete value.unknownEntry;
    expect(() => stores.updateItem(address, value)).toThrow('Unknown field');
    expect(() => stores.updateJson(address, JSON.stringify(value))).toThrow('Unknown field');
    expect(record()).toEqual(before);
    expect(get(stores.draft)).toBeNull();
  });

  it('persists invalid JSON only as a draft, blocks navigation/mode/export, clears with valid JSON or explicit discard', async () => {
    const initial = workspace();
    initial.dirty = false;
    const ctx = await setup(initial);
    expect(stores.updateJson(address, '{')).toBe(false);
    expect(record()).toEqual(initial);
    expect(get(stores.status).dirty).toBe(false);
    expect(get(stores.draft)?.text).toBe('{');
    expect(stores.select('lorebook')).toBe(false);
    expect(await stores.setEditorMode('form')).toBe(false);
    await expect(stores.exportFile()).rejects.toThrow('draft');
    expect(() => stores.updateItem(address, entry())).toThrow('draft');
    await Promise.resolve();
    expect((await ctx.storage.getDraft())?.text).toBe('{');
    expect(stores.updateJson(address, '[]')).toBe(false);
    expect(stores.updateJson(address, JSON.stringify(entry('valid')))).toBe(true);
    expect(get(stores.draft)).toBeNull();
    expect(record().dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(await ctx.storage.getDraft()).toBeNull();
    stores.updateJson(address, '{');
    await stores.discardDraft();
    expect(await stores.setEditorMode('form')).toBe(true);
    expect((await ctx.storage.getSettings()).editorMode).toBe('form');
  });

  it('loads persisted draft selection and mode without changing original settings', async () => {
    const doc = document();
    if (doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    doc.book.data.push(entry('second'));
    const ctx = context(workspace(doc));
    await ctx.storage.putDraft({ address: { ...address, index: 1 }, text: '{', updatedAt: 100 });
    const services = createServices(ctx.deps);
    stores = createEditorStores({ storage: ctx.storage, formats: ctx.formats, services, readFile: vi.fn() });
    await stores.initialize();
    expect(get(stores.ui)).toMatchObject({ selectedIndex: 1, editorMode: 'json' });
    expect(get(stores.settings).editorMode).toBe('form');
    expect(get(stores.draft)?.text).toBe('{');
  });

  it.each([
    { workspace: workspace(), address: { ...address, index: 99 } },
    { workspace: workspace(), address: { tab: 'card' } as const },
    { workspace: workspace(), address: { ...address, format: 'character-book' } as const },
    { workspace: null, address },
  ])('discards a persisted draft with a stale address and finishes initialization ($address)', async fixture => {
    const ctx = context(fixture.workspace);
    await ctx.storage.putDraft({ address: fixture.address, text: '{', updatedAt: 100 });
    const services = createServices(ctx.deps);
    const start = vi.spyOn(services.snapshot, 'start');
    stores = createEditorStores({ storage: ctx.storage, formats: ctx.formats, services, readFile: vi.fn() });
    await expect(stores.initialize()).resolves.toBeUndefined();
    expect(ctx.storage.clearDraft).toHaveBeenCalledOnce();
    expect(await ctx.storage.getDraft()).toBeNull();
    expect(get(stores.draft)).toBeNull();
    expect(get(stores.status).error).toBeNull();
    expect(get(stores.workspace).record).toEqual(fixture.workspace);
    expect(get(stores.ui)).toMatchObject({
      activeTab: fixture.workspace ? 'lorebook' : null,
      selectedIndex: fixture.workspace ? 0 : null,
      editorMode: 'form',
    });
    expect(start).toHaveBeenCalledOnce();
  });

  it('patches direct card fields, keeps unknowns/absent optional lists, and forbids asset reference changes', async () => {
    const doc: EditableDocument = {
      kind: 'charx', module: null,
      card: { data: { name: 'old', assets: [{ uri: 'asset://1' }], unknown: 'keep', character_book: { scan_depth: 5, entries: [] } }, extraEnvelope: true },
    };
    await setup(workspace(doc));
    stores.updateCard({ name: 'new', description: undefined });
    stores.setCardField('personality', 'text');
    expect(record().doc).toMatchObject({ card: { data: { name: 'new', personality: 'text', unknown: 'keep' }, extraEnvelope: true } });
    const currentDoc = record().doc;
    expect(currentDoc.kind === 'charx' && 'description' in currentDoc.card.data).toBe(false);
    expect(() => stores.setCardField('data.name', 'bad')).toThrow();
    expect(() => stores.setCardField('assets', [])).toThrow('Asset');
    const data = (record().doc as Extract<EditableDocument, { kind: 'charx' }>).card.data;
    expect(() => stores.updateJson({ tab: 'card' }, JSON.stringify({ ...data, assets: [] }))).toThrow('Asset');
    expect(() => stores.updateItem({ tab: 'card' }, { ...data, character_book: { entries: [] } } as CharacterCardData)).toThrow('Unknown field');
    expect(stores.select('lorebook')).toBe(true);
    expect(get(stores.ui).selectedIndex).toBeNull();
    stores.addItem({ tab: 'lorebook', format: 'character-book' }, { content: 'native', unknown: 7 });
    expect(get(stores.workspace).lorebookFormat).toBe('character-book');
  });

  it('creates optional module collections only when adding and keeps module envelope unknowns', async () => {
    const doc: EditableDocument = {
      kind: 'risum', module: { type: 'risuModule', module: { name: 'm', description: '', id: 'id', assets: [], unknown: 1 }, envelopeUnknown: true },
    };
    await setup(workspace(doc));
    stores.select('regex');
    expect(record().doc).toEqual(doc);
    stores.addItem({ tab: 'regex' }, { comment: '', in: '', out: '', type: 'editinput', unknown: true });
    const value = (record().doc as Extract<EditableDocument, { kind: 'risum' }>).module.module;
    stores.updateItem({ tab: 'module' }, { ...value, name: 'updated' } as RisuModule);
    expect(record().doc).toMatchObject({ module: { envelopeUnknown: true, module: { name: 'updated', regex: [expect.objectContaining({ unknown: true })] } } });
    expect(() => stores.updateItem({ tab: 'module' }, { ...value, assets: [['a', 'b', 'c']] } as RisuModule)).toThrow('Asset');
    expect(() => stores.select('card')).toThrow();
  });
});

describe('import, export, restore and busy gating', () => {
  it('directly imports into an empty workspace; existing workspace stages without reading regardless of dirty', async () => {
    const ctx = await setup(null);
    await stores.requestImport(file());
    expect(record()).toMatchObject({ fileName: 'new.json', dirty: false, lastExportedAt: null });
    expect(get(stores.snapshots)[0]).toMatchObject({ pinned: true, reason: 'original' });
    expect(get(stores.status).lastSavedAt).toBe(1000);
    ctx.readFile.mockClear();
    await stores.requestImport(file('second.json'));
    expect(ctx.readFile).not.toHaveBeenCalled();
    expect(get(stores.ui).openDialog).toEqual({ kind: 'import-confirm', fileName: 'second.json' });
    expect(() => stores.closeDialog()).toThrow('confirmImport');
    await stores.confirmImport('cancel');
    expect(get(stores.ui).openDialog).toBeNull();
    expect(record().fileName).toBe('new.json');
  });

  it('continue replaces after successful prepare, discarding draft; failed parse leaves dialog and all data pending', async () => {
    const ctx = await setup();
    stores.updateJson(address, '{');
    await stores.requestImport(file());
    ctx.readFile.mockResolvedValueOnce(new Uint8Array());
    const old = record();
    await expect(stores.confirmImport('continue')).rejects.toThrow();
    expect(record()).toEqual(old);
    expect(get(stores.draft)?.text).toBe('{');
    expect(get(stores.ui).openDialog?.kind).toBe('import-confirm');
    expect(ctx.storage.replaceWorkspace).not.toHaveBeenCalled();
    await stores.confirmImport('continue');
    expect(record().fileName).toBe('new.json');
    expect(get(stores.draft)).toBeNull();
    expect(await ctx.storage.getDraft()).toBeNull();
    expect(get(stores.ui).openDialog).toBeNull();
    expect(get(stores.ui).selectedIndex).toBe(0);
  });

  it('export-then-continue proceeds only after successful export and keeps confirmation pending on failure', async () => {
    const ctx = await setup();
    await stores.requestImport(file());
    vi.mocked(ctx.formats.validate).mockReturnValueOnce([{ severity: 'error', path: '', message: 'bad' }]);
    await expect(stores.confirmImport('export-then-continue')).rejects.toThrow('validation');
    expect(record().dirty).toBe(true);
    expect(get(stores.ui).openDialog?.kind).toBe('import-confirm');
    expect(ctx.readFile).not.toHaveBeenCalled();
    expect(ctx.storage.replaceWorkspace).not.toHaveBeenCalled();
    await stores.confirmImport('export-then-continue');
    expect(ctx.events.indexOf('download')).toBeLessThan(ctx.events.indexOf('replaceWorkspace'));
    expect(record().fileName).toBe('new.json');
    expect(get(stores.status).dirty).toBe(false);
  });

  it('blocks mutations during import, export, and restore and reports failures', async () => {
    const ctx = await setup();
    const bytes = deferred<Uint8Array>();
    ctx.readFile.mockImplementationOnce(() => bytes.promise);
    await stores.requestImport(file());
    const importing = stores.confirmImport('continue');
    expect(get(stores.ui).busy).toBe('import');
    expect(() => stores.select('lorebook')).toThrow('busy');
    expect(() => stores.updateItem(address, entry())).toThrow('busy');
    await expect(stores.updateSettings({ theme: 'dark' })).rejects.toThrow('busy');
    bytes.resolve(input().bytes);
    await importing;
    const download = deferred<void>();
    ctx.download.mockImplementationOnce(() => download.promise);
    const exporting = stores.exportFile();
    expect(get(stores.ui).busy).toBe('export');
    expect(() => stores.addItem({ tab: 'lorebook', format: 'risu' }, entry())).toThrow('busy');
    await expect(stores.requestImport(file())).rejects.toThrow('busy');
    download.resolve();
    await exporting;
    const target = await stores.takeManualSnapshot('keep');
    stores.updateItem(address, entry('newer'));
    stores.updateJson(address, '{');
    const restoring = stores.restoreSnapshot(target.id);
    expect(get(stores.ui).busy).toBe('restore');
    expect(() => stores.removeItem(address)).toThrow('busy');
    await restoring;
    expect(record().doc).toEqual(document());
    expect(record().dirty).toBe(true);
    expect(get(stores.draft)).toBeNull();
    expect(get(stores.snapshots).some(snapshot => snapshot.reason === 'before-restore')).toBe(true);
    expect(get(stores.ui).busy).toBeNull();
  });

  it('does not overwrite newer edits when an old autosave finishes', async () => {
    const ctx = await setup();
    const blocked = deferred<void>();
    const originalPut = ctx.storage.putWorkspace;
    let first = true;
    ctx.storage.putWorkspace = vi.fn(async value => {
      if (first) { first = false; await blocked.promise; }
      await originalPut(value);
    });
    stores.updateItem(address, entry('first'));
    await vi.advanceTimersByTimeAsync(1000);
    stores.updateItem(address, entry('second'));
    blocked.resolve();
    await ctx.services.autosave.flush();
    expect(record().doc).toMatchObject({ book: { data: [entry('second')] } });
    expect(record().dirty).toBe(true);
  });

  it('disposes during a busy export, awaits saves and export, and never restarts intervals', async () => {
    const ctx = await setup();
    const saveStarted = deferred<void>();
    const pendingSave = deferred<void>();
    const downloadStarted = deferred<void>();
    const pendingDownload = deferred<void>();
    const originalPut = ctx.storage.putWorkspace;
    vi.mocked(ctx.storage.putWorkspace).mockImplementationOnce(async value => {
      saveStarted.resolve();
      await pendingSave.promise;
      await originalPut(value);
    });
    ctx.download.mockImplementationOnce(async () => {
      downloadStarted.resolve();
      await pendingDownload.promise;
    });
    const flush = vi.spyOn(ctx.services.autosave, 'flush');
    const stop = vi.spyOn(ctx.services.snapshot, 'stop');
    const start = vi.spyOn(ctx.services.snapshot, 'start');

    stores.updateItem(address, entry('exported edit'));
    const exporting = stores.exportFile();
    expect(get(stores.ui).busy).toBe('export');
    const disposing = stores.dispose();
    expect(stores.dispose()).toBe(disposing);
    let finished = false;
    void disposing.then(() => { finished = true; });
    try {
      await saveStarted.promise;
      expect(finished).toBe(false);
      expect(() => stores.updateItem(address, entry('too late'))).toThrow('disposed');
      await expect(stores.requestImport(file())).rejects.toThrow('disposed');
      pendingSave.resolve();
      await downloadStarted.promise;
      expect((await ctx.storage.getWorkspace())?.doc).toMatchObject({ book: { data: [entry('exported edit')] } });
      expect(finished).toBe(false);
    } finally {
      pendingSave.resolve();
      pendingDownload.resolve();
      await exporting;
      await disposing;
    }
    expect(flush).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(get(stores.ui).busy).toBeNull();
    const snapshots = get(stores.snapshots);
    await ctx.services.snapshot.take(workspace(), 'manual');
    expect(get(stores.snapshots)).toEqual(snapshots);
    expect(await ctx.storage.listSnapshots()).toHaveLength(snapshots.length + 1);
  });

  it('validates settings, enforces retention immediately, refreshes snapshots, and manages ordinary dialogs', async () => {
    const ctx = await setup();
    await expect(stores.updateSettings({ snapshotLimitMB: 0 })).rejects.toThrow('Invalid settings');
    await expect(stores.updateSettings({ snapshotIntervalMin: Infinity })).rejects.toThrow();
    await expect(stores.updateSettings({ snapshotIntervalMin: -1 })).rejects.toThrow();
    const pinned = await stores.takeManualSnapshot('pin');
    await ctx.services.snapshot.take(workspace(), 'before-bulk');
    await stores.updateSettings({ snapshotIntervalMin: 0, snapshotLimitMB: 1 / 1024 ** 2, theme: 'dark' });
    expect(get(stores.snapshots)).toHaveLength(1);
    expect(get(stores.settings).theme).toBe('dark');
    await stores.deleteSnapshot(pinned.id);
    expect(get(stores.snapshots)).toEqual([]);
    stores.openDialog({ kind: 'settings' });
    expect(get(stores.ui).openDialog).toEqual({ kind: 'settings' });
    stores.closeDialog();
    expect(get(stores.ui).openDialog).toBeNull();
  });
});
