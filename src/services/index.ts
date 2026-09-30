import { FormatError } from '$contracts';
import type {
  AutosaveResult, CreateServices, EditableDocument, PreparedImport, SnapshotReason,
  SnapshotRecord, WorkspaceRecord,
} from '$contracts';

/** Encode key order explicitly: JSON.stringify alone reorders integer-like keys. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${Array.from(value, child =>
    child === undefined ? 'null' : canonicalJson(child)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    throw new Error('Document contains a non-JSON value');
  }
  return encoded;
}

export const createServices: CreateServices = ({ storage, formats, download, now, newId, sha256Hex }) => {
  let workTail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(snapshots: SnapshotRecord[]) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let generation = 0;
  let intervalGetter: (() => WorkspaceRecord | null) | null = null;
  let intervalError: ((error: unknown) => void) | null = null;
  let intervalTail: Promise<unknown> = Promise.resolve();

  function report(error: unknown, handler = intervalError) {
    // A failing error observer must not turn background work into an unhandled rejection.
    try { handler?.(error); } catch { /* Observers do not own service state. */ }
  }

  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = workTail.then(operation);
    workTail = result.catch(() => {});
    return result;
  }

  async function notify() {
    const snapshots = await storage.listSnapshots();
    for (const listener of listeners) {
      try { listener(structuredClone(snapshots)); }
      catch (error) { report(error); }
    }
  }

  async function makeSnapshot(doc: EditableDocument, reason: SnapshotReason, label?: string): Promise<SnapshotRecord> {
    const detached = structuredClone(doc);
    const bytes = new TextEncoder().encode(canonicalJson(detached));
    const contentHash = await sha256Hex(bytes);
    return {
      id: newId(), time: now(), label: label ?? reason,
      pinned: ['original', 'manual', 'export'].includes(reason), reason,
      doc: detached, size: bytes.byteLength, contentHash,
    };
  }

  async function prune() {
    const settings = await storage.getSettings();
    const snapshots = await storage.listSnapshots();
    let total = snapshots.reduce((sum, snapshot) => sum + snapshot.size, 0);
    const limit = settings.snapshotLimitMB * 1024 * 1024;
    for (const snapshot of snapshots) {
      if (total <= limit) break;
      if (snapshot.pinned) continue;
      await storage.deleteSnapshot(snapshot.id);
      total -= snapshot.size;
    }
  }

  async function take(workspace: WorkspaceRecord, reason: SnapshotReason, label?: string) {
    const snapshot = await makeSnapshot(workspace.doc, reason, label);
    if (reason === 'interval') {
      const snapshots = await storage.listSnapshots();
      if (snapshots.at(-1)?.contentHash === snapshot.contentHash) return null;
    }
    await storage.addSnapshot(snapshot);
    await prune();
    await notify();
    return structuredClone(snapshot);
  }

  let debounce: ReturnType<typeof setTimeout> | null = null;
  let writeTail: Promise<unknown> = Promise.resolve();
  let latestWrite: Promise<AutosaveResult | null> = Promise.resolve(null);
  type Pending = {
    workspace: WorkspaceRecord;
    resolve(result: AutosaveResult | null): void;
    reject(error: unknown): void;
  };
  let pending: Pending | null = null;
  const verifiedFrozen = new WeakSet<object>();

  function deeplyFrozen(value: unknown): boolean {
    if (!value || typeof value !== 'object') return true;
    if (verifiedFrozen.has(value)) return true;
    if (!Object.isFrozen(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (!('value' in descriptor) || !deeplyFrozen(descriptor.value)) return false;
    }
    verifiedFrozen.add(value);
    return true;
  }

  function dropPending() {
    if (debounce !== null) clearTimeout(debounce);
    debounce = null;
    pending?.resolve(null);
    pending = null;
  }

  function savePending(): Promise<AutosaveResult | null> {
    if (debounce !== null) clearTimeout(debounce);
    debounce = null;
    const request = pending;
    pending = null;
    if (!request) return latestWrite;
    const result = writeTail.then(async () => {
      // Frozen store records can wait untouched through debounce; storage gets its own copy.
      await storage.putWorkspace(structuredClone(request.workspace));
      return { workspace: structuredClone(request.workspace), savedAt: now() };
    });
    latestWrite = result;
    writeTail = result.catch(() => {});
    void result.then(request.resolve, request.reject);
    return result;
  }

  const autosave = {
    schedule(workspace: WorkspaceRecord): Promise<AutosaveResult | null> {
      const copy = deeplyFrozen(workspace) ? workspace : structuredClone(workspace);
      dropPending();
      const result = new Promise<AutosaveResult | null>((resolve, reject) => {
        pending = { workspace: copy, resolve, reject };
      });
      debounce = setTimeout(() => { void savePending().catch(() => {}); }, 1000);
      return result;
    },
    flush: () => savePending(),
    async cancel() {
      dropPending();
      await writeTail;
      latestWrite = Promise.resolve(null);
    },
  };

  const snapshot = {
    take(workspace: WorkspaceRecord, reason: SnapshotReason, label?: string) {
      const copy = structuredClone(workspace);
      return serial(() => take(copy, reason, label));
    },
    list: () => serial(() => storage.listSnapshots()),
    remove: (id: string) => serial(async () => {
      await storage.deleteSnapshot(id);
      await notify();
    }),
    enforceRetention: () => serial(async () => { await prune(); await notify(); }),
    restore(workspace: WorkspaceRecord, snapshotId: string) {
      const current = structuredClone(workspace);
      return serial(async () => {
        const target = (await storage.listSnapshots()).find(entry => entry.id === snapshotId);
        if (!target || target.doc.kind !== current.kind) throw new Error('Snapshot does not belong to this workspace');
        // Resolve and detach before retention can prune the target snapshot.
        const doc = structuredClone(target.doc);
        await take(current, 'before-restore');
        const restored = { ...current, doc, dirty: true, updatedAt: now() } as WorkspaceRecord;
        await storage.putWorkspace(restored);
        await storage.clearDraft();
        return structuredClone(restored);
      });
    },
    start(getWorkspace: () => WorkspaceRecord | null, onError: (error: unknown) => void) {
      if (timer !== null) clearInterval(timer);
      timer = null;
      intervalGetter = getWorkspace;
      intervalError = onError;
      const token = ++generation;
      void storage.getSettings().then(settings => {
        if (token !== generation || settings.snapshotIntervalMin === 0) return;
        timer = setInterval(() => {
          const job = serial(async () => {
            if (token !== generation) return;
            const current = getWorkspace();
            if (current) await take(structuredClone(current), 'interval');
          });
          intervalTail = job.catch(error => report(error, onError));
        }, settings.snapshotIntervalMin * 60_000);
      }).catch(error => report(error, onError));
    },
    async stop() {
      ++generation;
      if (timer !== null) clearInterval(timer);
      timer = null;
      await intervalTail;
      await workTail;
    },
    subscribe(listener: (snapshots: SnapshotRecord[]) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };

  const preparedImports = new WeakMap<PreparedImport, PreparedImport>();
  return {
    autosave, snapshot,
    import: {
      async prepare(input) {
        const bytes = new Uint8Array(input.bytes);
        const kind = formats.detectKind(input.fileName, bytes);
        if (!kind) throw new FormatError('unsupported-format', 'Unsupported file format');
        const result = formats.registry[kind].parse(bytes, input.fileName);
        const prepared = { fileName: input.fileName, doc: structuredClone(result.doc), preserved: result.preserved };
        preparedImports.set(prepared, { ...prepared, doc: structuredClone(prepared.doc) });
        return prepared;
      },
      async commit(prepared) {
        const accepted = preparedImports.get(prepared);
        if (!accepted) throw new Error('Import must be prepared before commit');
        const doc = structuredClone(accepted.doc);
        await autosave.cancel();
        await snapshot.stop();
        try {
          return await serial(async () => {
            const original = await makeSnapshot(doc, 'original');
            const workspace = await storage.replaceWorkspace(doc, accepted.preserved, {
              metadata: { fileName: accepted.fileName, dirty: false, lastExportedAt: null, updatedAt: now() },
              original,
            });
            await notify();
            return workspace;
          });
        } finally {
          if (intervalGetter && intervalError) snapshot.start(intervalGetter, intervalError);
        }
      },
    },
    export: {
      export(workspace) {
        const copy = structuredClone(workspace);
        return serial(async () => {
          const issues = formats.validate(structuredClone(copy.doc));
          if (issues.some(issue => issue.severity === 'error')) return { status: 'invalid' as const, issues };
          const preserved = await storage.getPreserved();
          if (!preserved) throw new Error('Preserved payload is missing');
          // The registry is correlated by kind; dispatch explicitly to preserve TS narrowing.
          let bytes: Uint8Array;
          switch (copy.kind) {
            case 'charx': bytes = formats.registry.charx.build(structuredClone(copy.doc), preserved); break;
            case 'risum': bytes = formats.registry.risum.build(structuredClone(copy.doc), preserved); break;
            case 'lorebook': bytes = formats.registry.lorebook.build(structuredClone(copy.doc), preserved); break;
          }
          await download(copy.fileName, bytes);
          const exportedSnapshot = await take(copy, 'export');
          if (!exportedSnapshot) throw new Error('Export snapshot was not saved');
          const exported = { ...copy, dirty: false, lastExportedAt: now() };
          await storage.putWorkspace(exported);
          return { status: 'exported' as const, workspace: exported, snapshot: exportedSnapshot, issues };
        });
      },
    },
  };
};
