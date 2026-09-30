import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type {
  CreateStorage, DraftRecord, PreservedPayload, Settings, SnapshotRecord,
  WorkspaceRecord,
} from '$contracts';

interface EditorDatabase extends DBSchema {
  workspace: { key: string; value: WorkspaceRecord };
  snapshots: { key: string; value: SnapshotRecord };
  preserved: { key: string; value: PreservedPayload };
  draft: { key: string; value: DraftRecord };
}

const databaseName = 'solene-editor';
const settingsKey = 'solene-editor.settings';
const singletonKey = 'current';
const defaults: Settings = {
  snapshotIntervalMin: 5, snapshotLimitMB: 100, theme: 'system', editorMode: 'form',
};

function validSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Settings;
  return Number.isFinite(candidate.snapshotIntervalMin) && candidate.snapshotIntervalMin >= 0
    && Number.isFinite(candidate.snapshotLimitMB) && candidate.snapshotLimitMB > 0
    && ['system', 'light', 'dark'].includes(candidate.theme)
    && ['form', 'json'].includes(candidate.editorMode);
}

/** One instance owns a serialized memory mirror of the active browser database. */
export const createStorage: CreateStorage = async () => {
  let db: IDBPDatabase<EditorDatabase> | null = null;
  let workspace: WorkspaceRecord | null = null;
  let preserved: PreservedPayload | null = null;
  let draft: DraftRecord | null = null;
  let snapshots = new Map<string, SnapshotRecord>();
  let settings = structuredClone(defaults);
  let local: globalThis.Storage | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  try {
    // Persistence is best effort and must not hold up initialization.
    void globalThis.navigator?.storage?.persist?.().catch(() => {});
  } catch { /* Browser policy may forbid even accessing storage. */ }

  try {
    db = await openDB<EditorDatabase>(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore('workspace');
        database.createObjectStore('snapshots', { keyPath: 'id' });
        database.createObjectStore('preserved');
        database.createObjectStore('draft');
      },
      blocking() { db?.close(); db = null; },
      terminated() { db = null; },
    });
    const transaction = db.transaction(['workspace', 'snapshots', 'preserved', 'draft']);
    const [savedWorkspace, savedSnapshots, savedPreserved, savedDraft] = await Promise.all([
      transaction.objectStore('workspace').get(singletonKey),
      transaction.objectStore('snapshots').getAll(),
      transaction.objectStore('preserved').get(singletonKey),
      transaction.objectStore('draft').get(singletonKey),
    ]);
    await transaction.done;
    workspace = savedWorkspace ?? null;
    snapshots = new Map(savedSnapshots.map(snapshot => [snapshot.id, snapshot]));
    preserved = savedPreserved ?? null;
    draft = savedDraft ?? null;
  } catch {
    db?.close();
    db = null;
  }
  try {
    local = globalThis.localStorage;
    const text = local?.getItem(settingsKey);
    const saved: unknown = text ? JSON.parse(text) : null;
    if (validSettings(saved)) settings = structuredClone(saved);
  } catch { local = null; }

  function serial<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }

  async function persist(operation: (database: IDBPDatabase<EditorDatabase>) => Promise<unknown>) {
    if (!db) return;
    try { await operation(db); }
    catch { db.close(); db = null; }
  }

  const sortedSnapshots = () => [...snapshots.values()].sort((a, b) =>
    a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    getWorkspace: () => serial(() => structuredClone(workspace)),
    putWorkspace(value) {
      const copy = structuredClone(value);
      return serial(async () => {
        await persist(database => database.put('workspace', copy, singletonKey));
        workspace = copy;
      });
    },
    replaceWorkspace(doc, payload, replacement) {
      const next = structuredClone({ ...replacement.metadata, kind: doc.kind, doc }) as WorkspaceRecord;
      const nextPayload = structuredClone(payload);
      const original = structuredClone(replacement.original);
      return serial(async () => {
        if (db) {
          const transaction = db.transaction(['workspace', 'snapshots', 'preserved', 'draft'], 'readwrite');
          try {
            // Queue the whole transaction before yielding; mirror changes only after commit.
            await Promise.all([
              transaction.objectStore('workspace').clear(),
              transaction.objectStore('snapshots').clear(),
              transaction.objectStore('preserved').clear(),
              transaction.objectStore('draft').clear(),
              transaction.objectStore('workspace').put(next, singletonKey),
              transaction.objectStore('preserved').put(nextPayload, singletonKey),
              transaction.objectStore('snapshots').put(original),
            ]);
            await transaction.done;
          } catch (error) {
            try { transaction.abort(); } catch { /* Already aborted. */ }
            await transaction.done.catch(() => {});
            db.close();
            db = null;
            throw error;
          }
        }
        workspace = next;
        preserved = nextPayload;
        draft = null;
        snapshots = new Map([[original.id, original]]);
        return structuredClone(next);
      });
    },
    getPreserved: () => serial(() => structuredClone(preserved)),
    addSnapshot(value) {
      const copy = structuredClone(value);
      return serial(async () => {
        await persist(database => database.put('snapshots', copy));
        snapshots.set(copy.id, copy);
      });
    },
    listSnapshots: () => serial(() => structuredClone(sortedSnapshots())),
    deleteSnapshot: id => serial(async () => {
      await persist(database => database.delete('snapshots', id));
      snapshots.delete(id);
    }),
    getTotalSnapshotSize: () => serial(() => sortedSnapshots().reduce((sum, snapshot) => sum + snapshot.size, 0)),
    getDraft: () => serial(() => structuredClone(draft)),
    putDraft(value) {
      const copy = structuredClone(value);
      return serial(async () => {
        await persist(database => database.put('draft', copy, singletonKey));
        draft = copy;
      });
    },
    clearDraft: () => serial(async () => {
      await persist(database => database.delete('draft', singletonKey));
      draft = null;
    }),
    getSettings: () => serial(() => structuredClone(settings)),
    setSettings(value) {
      if (!validSettings(value)) return Promise.reject(new Error('Invalid settings'));
      const copy = structuredClone(value);
      return serial(() => {
        try { local?.setItem(settingsKey, JSON.stringify(copy)); }
        catch { local = null; }
        settings = copy;
      });
    },
  };
};
