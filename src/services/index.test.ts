import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServices } from './index';
import { context, deferred, document, entry, input, payload, workspace } from './test-helpers';
import type { JsonValue, SnapshotRecord } from '$contracts';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('import and export', () => {
  it('prepares without side effects and failed detection/parse retains the current data', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const prepared = await services.import.prepare(input());
    expect(prepared.doc).toEqual(document());
    expect(ctx.events).toEqual([]);
    await expect(services.import.prepare({ fileName: 'bad.bin', bytes: new Uint8Array() })).rejects.toThrow();
    await expect(services.import.prepare({ fileName: 'bad.json', bytes: new Uint8Array() })).rejects.toThrow();
    expect(await ctx.storage.getWorkspace()).toEqual(workspace());
    expect(ctx.events).toEqual([]);
    await expect(services.import.commit({ ...prepared })).rejects.toThrow('prepared');
    const imported = await services.import.commit(prepared);
    expect(imported).toMatchObject({ dirty: false, lastExportedAt: null, fileName: 'new.json' });
    expect(await services.snapshot.list()).toEqual([expect.objectContaining({ pinned: true, reason: 'original' })]);
  });

  it('invalid export has no side effects; warnings allow download, pinned snapshot, then dirty=false', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    vi.mocked(ctx.formats.validate).mockReturnValueOnce([{ severity: 'error', path: '', message: 'bad' }]);
    expect((await services.export.export(workspace())).status).toBe('invalid');
    expect(ctx.events).toEqual([]);
    expect(ctx.storage.getPreserved).not.toHaveBeenCalled();
    vi.mocked(ctx.formats.validate).mockReturnValue([{ severity: 'warning', path: '/book', message: 'unknown' }]);
    const result = await services.export.export(workspace());
    expect(result.status).toBe('exported');
    if (result.status !== 'exported') throw new Error('Expected export');
    expect(result.workspace).toMatchObject({ dirty: false, lastExportedAt: 1000 });
    expect(result.snapshot).toMatchObject({ pinned: true, reason: 'export' });
    expect(result.issues[0].severity).toBe('warning');
    expect(ctx.events).toEqual(['download', 'snapshot:export', 'putWorkspace']);
    expect(ctx.download).toHaveBeenCalledWith('original.json', expect.any(Uint8Array));
    expect(ctx.formats.registry.lorebook.build).toHaveBeenCalledWith(document(), payload);
  });

  it('download/build/snapshot failures never clear dirty and build gets a detached doc', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    vi.mocked(ctx.formats.registry.lorebook.build).mockImplementation(doc => {
      doc.book.data[0].content = 'derived';
      return new Uint8Array([1]);
    });
    const source = workspace();
    ctx.download.mockRejectedValueOnce(new Error('download failed'));
    await expect(services.export.export(source)).rejects.toThrow('download failed');
    expect(source.doc).toEqual(document());
    expect((await ctx.storage.getWorkspace())?.dirty).toBe(true);
    expect(await services.snapshot.list()).toEqual([]);
    vi.mocked(ctx.storage.addSnapshot).mockRejectedValueOnce(new Error('snapshot failed'));
    await expect(services.export.export(source)).rejects.toThrow('snapshot failed');
    expect((await ctx.storage.getWorkspace())?.dirty).toBe(true);
    vi.mocked(ctx.formats.registry.lorebook.build).mockImplementationOnce(() => { throw new Error('build failed'); });
    await expect(services.export.export(source)).rejects.toThrow('build failed');
  });
});

describe('snapshots', () => {
  it('omits undefined object keys and encodes undefined array entries as null for snapshots and export', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const doc = document();
    if (doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    doc.book.data[0].id = undefined;
    doc.book.unknownRoot = {
      absent: undefined,
      array: [undefined, , { missing: undefined, present: true }] as unknown as JsonValue[],
      nested: { absent: undefined, present: 'value' },
    };
    const taken = (await services.snapshot.take(workspace(doc), 'manual'))!;
    const bytes = ctx.sha256Hex.mock.calls[0][0];
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain('"id":');
    expect(text).toContain('"unknownRoot":{"array":[null,null,{"present":true}],"nested":{"present":"value"}}');
    expect(taken.size).toBe(bytes.byteLength);
    const normalized = JSON.parse(JSON.stringify(doc));
    expect(await services.snapshot.take(workspace(normalized), 'interval')).toBeNull();
    const exported = await services.export.export(workspace(doc));
    expect(exported.status).toBe('exported');
    if (exported.status === 'exported') expect(exported.snapshot.contentHash).toBe(taken.contentHash);
  });

  it('hashes canonical UTF-8 with lexically sorted keys (including integer keys) and keeps array order', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const doc = document();
    if (doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    doc.book.unknownRoot = { '2': 'é', '10': '한', z: [2, 1], '\u{10000}': 1, '\ue000': 2 };
    const taken = (await services.snapshot.take(workspace(doc), 'manual'))!;
    const bytes = ctx.sha256Hex.mock.calls[0][0];
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('"10":"한","2":"é","z":[2,1],"𐀀":1,"":2');
    expect(taken.size).toBe(bytes.byteLength);
    expect(taken.contentHash).toMatch(/^[0-9a-f]{64}$/);
    doc.book.data[0].content = 'mutated';
    expect(taken.doc).not.toEqual(doc);
    expect(await services.snapshot.take(workspace(taken.doc), 'interval')).toBeNull();
    expect(await services.snapshot.take(workspace(taken.doc), 'manual')).not.toBeNull();
    expect(await services.snapshot.take(workspace(doc), 'interval')).not.toBeNull();
  });

  it('prunes oldest unpinned by time/id, includes pinned size, permits pinned overflow, and notifies', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const listener = vi.fn();
    const unsubscribe = services.snapshot.subscribe(listener);
    const pinned = (await services.snapshot.take(workspace(), 'manual'))!;
    const base: SnapshotRecord = { ...pinned, pinned: false, reason: 'interval', size: 10, time: 1 };
    await ctx.storage.addSnapshot({ ...base, id: 'b' });
    await ctx.storage.addSnapshot({ ...base, id: 'a' });
    await ctx.storage.setSettings({ ...(await ctx.storage.getSettings()), snapshotIntervalMin: 0, snapshotLimitMB: (pinned.size + 10) / 1024 ** 2 });
    await services.snapshot.enforceRetention();
    expect((await services.snapshot.list()).map(snapshot => snapshot.id)).toEqual(['b', pinned.id]);
    expect(ctx.events).toContain('delete:a');
    await ctx.storage.setSettings({ ...(await ctx.storage.getSettings()), snapshotLimitMB: 1 / 1024 ** 2 });
    await services.snapshot.enforceRetention();
    expect(await services.snapshot.list()).toEqual([pinned]);
    await services.snapshot.remove(pinned.id);
    expect(await services.snapshot.list()).toEqual([]);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    const calls = listener.mock.calls.length;
    await services.snapshot.take(workspace(), 'manual');
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('saves before-restore first, preserves metadata/payload, clears draft, and aborts on save failure', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const target = (await services.snapshot.take(workspace(), 'manual'))!;
    const current = document();
    if (current.kind !== 'lorebook') throw new Error('Expected lorebook');
    current.book.data = [entry('new')];
    await ctx.storage.putDraft({ address: { tab: 'lorebook', format: 'risu', index: 0 }, text: '{', updatedAt: 1 });
    ctx.events.length = 0;
    vi.mocked(ctx.storage.addSnapshot).mockRejectedValueOnce(new Error('failed')); 
    await expect(services.snapshot.restore(workspace(current), target.id)).rejects.toThrow('failed');
    expect(ctx.events).toEqual([]);
    const restored = await services.snapshot.restore(workspace(current), target.id);
    expect(ctx.events).toEqual(['snapshot:before-restore', 'putWorkspace', 'clearDraft']);
    expect(restored).toMatchObject({ fileName: 'original.json', lastExportedAt: 5, dirty: true, updatedAt: 1000, doc: document() });
    expect(await ctx.storage.getPreserved()).toBe(payload);
    expect(await ctx.storage.getDraft()).toBeNull();
    await expect(services.snapshot.restore(workspace(), 'other')).rejects.toThrow('workspace');
  });

  it('uses latest workspace on each tick, stops/restarts timers, and surfaces interval failures', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    await ctx.storage.setSettings({ ...(await ctx.storage.getSettings()), snapshotIntervalMin: 1 });
    let latest = workspace();
    const onError = vi.fn();
    services.snapshot.start(() => latest, onError);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await services.snapshot.list()).toHaveLength(1);
    latest = workspace({ kind: 'lorebook', book: { type: 'risu', ver: 1, data: [entry('later')] } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await services.snapshot.list()).at(-1)?.doc).toEqual(latest.doc);
    vi.mocked(ctx.storage.addSnapshot).mockRejectedValueOnce(new Error('quota'));
    latest = workspace(document());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'quota' }));
    await services.snapshot.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await services.snapshot.list()).toHaveLength(2);
    await ctx.storage.setSettings({ ...(await ctx.storage.getSettings()), snapshotIntervalMin: 0 });
    services.snapshot.start(() => latest, onError);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await services.snapshot.list()).toHaveLength(2);
    await services.snapshot.stop();
  });
});

describe('autosave and replacement ordering', () => {
  it('defers copying fully frozen records until saving but detaches shallow-frozen inputs immediately', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const frozen = workspace();
    function freeze(value: unknown) {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    }
    freeze(frozen);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const saved = services.autosave.schedule(frozen);
    expect(clone).not.toHaveBeenCalled();
    await services.autosave.flush();
    const result = await saved;
    expect(result?.workspace).toEqual(frozen);
    expect(result?.workspace).not.toBe(frozen);
    expect(vi.mocked(ctx.storage.putWorkspace).mock.calls[0][0]).not.toBe(frozen);
    expect(clone).toHaveBeenCalled();
    clone.mockClear();
    const shallow = Object.freeze(workspace());
    const second = services.autosave.schedule(shallow);
    expect(clone).toHaveBeenCalledOnce();
    if (shallow.doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    shallow.doc.book.data[0].content = 'external mutation';
    await services.autosave.flush();
    expect((await second)?.workspace.doc).toEqual(document());
  });

  it('debounces detached records, resolves superseded schedules null, flushes and cancels', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const first = services.autosave.schedule(workspace());
    const later = workspace();
    later.fileName = 'latest.json';
    const second = services.autosave.schedule(later);
    later.fileName = 'mutated.json';
    expect(await first).toBeNull();
    await vi.advanceTimersByTimeAsync(999);
    expect(ctx.storage.putWorkspace).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toMatchObject({ savedAt: 2000, workspace: { fileName: 'latest.json', dirty: true } });
    const flushSave = services.autosave.schedule(workspace());
    await services.autosave.flush();
    expect(await flushSave).not.toBeNull();
    const cancelled = services.autosave.schedule(workspace());
    await services.autosave.cancel();
    expect(await cancelled).toBeNull();
    expect(ctx.storage.putWorkspace).toHaveBeenCalledTimes(2);
  });

  it('serializes running writes and awaits them before replacement, dropping pending stale writes', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    const blocked = deferred<void>();
    const originalPut = ctx.storage.putWorkspace;
    let calls = 0;
    ctx.storage.putWorkspace = vi.fn(async value => {
      ++calls;
      if (calls === 1) await blocked.promise;
      await originalPut(value);
    });
    const oldSave = services.autosave.schedule(workspace());
    await vi.advanceTimersByTimeAsync(1000);
    const latest = workspace();
    latest.fileName = 'latest.json';
    const newSave = services.autosave.schedule(latest);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(1);
    blocked.resolve();
    await oldSave;
    await newSave;
    expect((await ctx.storage.getWorkspace())?.fileName).toBe('latest.json');
    const dropped = services.autosave.schedule(workspace());
    const prepared = await services.import.prepare(input());
    await services.import.commit(prepared);
    expect(await dropped).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await ctx.storage.getWorkspace())?.fileName).toBe('new.json');
  });

  it('awaits an in-flight interval before import replacement and restarts it afterward', async () => {
    const ctx = context();
    const services = createServices(ctx.deps);
    await ctx.storage.setSettings({ ...(await ctx.storage.getSettings()), snapshotIntervalMin: 1 });
    const blocked = deferred<string>();
    ctx.sha256Hex.mockImplementationOnce(() => blocked.promise);
    let latest = workspace();
    services.snapshot.start(() => latest, vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    const prepared = await services.import.prepare(input());
    const commit = services.import.commit(prepared);
    await Promise.resolve();
    expect(ctx.storage.replaceWorkspace).not.toHaveBeenCalled();
    blocked.resolve('old-hash');
    latest = await commit;
    expect(ctx.events).toEqual(['snapshot:interval', 'replaceWorkspace']);
    expect(await services.snapshot.list()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await services.snapshot.list()).toHaveLength(1);
    await services.snapshot.stop();
  });
});
