import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorage } from './index';
import { document, payload, workspace } from '../services/test-helpers';
import type { SnapshotRecord } from '$contracts';

const snapshot = (id = 'original'): SnapshotRecord => ({
  id, time: 10, label: 'original', pinned: true, reason: 'original', doc: document(), size: 100, contentHash: 'hash',
});
const replacement = () => ({ metadata: { fileName: 'new.json', dirty: false, updatedAt: 20, lastExportedAt: null }, original: snapshot() });

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('navigator', { storage: { persist: vi.fn(async () => true) } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('browser storage', () => {
  it('persists all object stores, detaches reads, sorts snapshots, and requests persistence', async () => {
    const storage = await createStorage();
    expect(navigator.storage.persist).toHaveBeenCalledOnce();
    await storage.replaceWorkspace(document(), payload, replacement());
    await storage.putWorkspace(workspace());
    await storage.putDraft({ address: { tab: 'lorebook', format: 'risu', index: 0 }, text: '{', updatedAt: 1 });
    await storage.addSnapshot({ ...snapshot('b'), time: 5, size: 20 });
    await storage.addSnapshot({ ...snapshot('a'), time: 5, size: 30 });
    await storage.setSettings({ snapshotIntervalMin: 0, snapshotLimitMB: 1, theme: 'dark', editorMode: 'json' });
    const reopened = await createStorage();
    expect(await reopened.getWorkspace()).toEqual(workspace());
    expect(await reopened.getPreserved()).toEqual(payload);
    expect((await reopened.getDraft())?.text).toBe('{');
    expect((await reopened.listSnapshots()).map(value => value.id)).toEqual(['a', 'b', 'original']);
    expect(await reopened.getTotalSnapshotSize()).toBe(150);
    expect((await reopened.getSettings()).editorMode).toBe('json');
    const read = (await reopened.getWorkspace())!;
    read.fileName = 'mutated';
    expect((await reopened.getWorkspace())?.fileName).toBe('original.json');
    const preserved = (await reopened.getPreserved())!;
    preserved.entries[0].bytes[0] = 99;
    expect((await reopened.getPreserved())?.entries[0].bytes[0]).toBe(1);
    await reopened.clearDraft();
    await reopened.deleteSnapshot('a');
    expect(await reopened.getDraft()).toBeNull();
    expect(await reopened.getTotalSnapshotSize()).toBe(120);
  });

  it('uses memory when browser storage is unavailable and handles invalid settings', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); } });
    const storage = await createStorage();
    expect(await storage.getSettings()).toEqual({ snapshotIntervalMin: 5, snapshotLimitMB: 100, theme: 'system', editorMode: 'form' });
    await storage.replaceWorkspace(document(), payload, replacement());
    await storage.putDraft({ address: { tab: 'lorebook', format: 'risu', index: 0 }, text: '{', updatedAt: 2 });
    await storage.addSnapshot(snapshot('manual'));
    expect(await storage.getTotalSnapshotSize()).toBe(200);
    await storage.replaceWorkspace(document(), payload, replacement());
    expect(await storage.getDraft()).toBeNull();
    expect(await storage.listSnapshots()).toHaveLength(1);
    await storage.setSettings({ snapshotIntervalMin: 0, snapshotLimitMB: 2, theme: 'light', editorMode: 'form' });
    expect((await storage.getSettings()).snapshotLimitMB).toBe(2);
    await expect(storage.setSettings({ snapshotIntervalMin: -1, snapshotLimitMB: 0, theme: 'light', editorMode: 'form' })).rejects.toThrow();
  });

  it('falls back consistently after an ordinary IndexedDB write failure', async () => {
    const storage = await createStorage();
    await storage.replaceWorkspace(document(), payload, replacement());
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new Error('quota'); });
    await storage.putWorkspace(workspace());
    expect(await storage.getWorkspace()).toEqual(workspace());
    expect(await storage.getPreserved()).toEqual(payload);
    expect(await storage.listSnapshots()).toHaveLength(1);
    await storage.clearDraft();
    await storage.addSnapshot(snapshot('memory'));
    expect(await storage.listSnapshots()).toHaveLength(2);
  });

  it('aborts replacement atomically and retains the entire old database and mirror', async () => {
    const storage = await createStorage();
    await storage.replaceWorkspace(document(), payload, replacement());
    await storage.putDraft({ address: { tab: 'lorebook', format: 'risu', index: 0 }, text: '{old', updatedAt: 1 });
    const old = await storage.getWorkspace();
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const request = originalPut.apply(this, args);
      if (this.name === 'snapshots' && (args[0] as SnapshotRecord).id === 'fail') this.transaction.abort();
      return request;
    });
    await expect(storage.replaceWorkspace(document(), payload, { ...replacement(), original: snapshot('fail') })).rejects.toThrow();
    expect(await storage.getWorkspace()).toEqual(old);
    expect(await storage.listSnapshots()).toEqual([snapshot()]);
    expect((await storage.getDraft())?.text).toBe('{old');
    expect(await storage.getPreserved()).toEqual(payload);
    const reopened = await createStorage();
    expect(await reopened.getWorkspace()).toEqual(old);
    expect(await reopened.listSnapshots()).toEqual([snapshot()]);
    expect((await reopened.getDraft())?.text).toBe('{old');
    // A later retry may replace in memory, after the failed transaction preserved old data.
    await storage.replaceWorkspace(document(), payload, replacement());
    expect(await storage.getDraft()).toBeNull();
  });
});
