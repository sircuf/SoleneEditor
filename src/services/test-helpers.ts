import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import type {
  DocKind, DocumentOf, DraftRecord, EditableDocument, FormatCodec, FormatsApi, LoreBookEntry,
  PreservedPayload, Settings, SnapshotRecord, Storage, WorkspaceRecord,
} from '$contracts';

export const entry = (content = 'old'): LoreBookEntry => ({
  key: '', secondkey: '', insertorder: 0, comment: '', content, mode: 'normal',
  alwaysActive: false, selective: false, unknownEntry: { keep: true },
});
export const document = (): EditableDocument => ({
  kind: 'lorebook', book: { type: 'risu', ver: 1, data: [entry()], unknownRoot: true },
});
export const workspace = (doc = document()): WorkspaceRecord => ({
  kind: doc.kind, doc, fileName: 'original.json', dirty: true, updatedAt: 10, lastExportedAt: 5,
}) as WorkspaceRecord;

// This fixture stands in for the formats-owned branded payload, never production creation.
export const payload = {
  kind: 'lorebook', entries: [{ name: 'asset', bytes: new Uint8Array([1, 2]) }], metadata: {},
} as unknown as PreservedPayload;

export function fakeStorage(initial: WorkspaceRecord | null = workspace()) {
  let record = structuredClone(initial);
  let preserved: PreservedPayload | null = payload;
  let draft: DraftRecord | null = null;
  let snapshots: SnapshotRecord[] = [];
  let settings: Settings = { snapshotIntervalMin: 5, snapshotLimitMB: 100, theme: 'system', editorMode: 'form' };
  const events: string[] = [];
  const storage: Storage = {
    getWorkspace: vi.fn(async () => structuredClone(record)),
    putWorkspace: vi.fn(async value => { events.push('putWorkspace'); record = structuredClone(value); }),
    replaceWorkspace: vi.fn(async (doc, nextPayload, replacement) => {
      events.push('replaceWorkspace');
      record = structuredClone({ ...replacement.metadata, kind: doc.kind, doc }) as WorkspaceRecord;
      preserved = nextPayload;
      draft = null;
      snapshots = [structuredClone(replacement.original)];
      return structuredClone(record);
    }),
    getPreserved: vi.fn(async () => preserved),
    addSnapshot: vi.fn(async snapshot => { events.push(`snapshot:${snapshot.reason}`); snapshots.push(structuredClone(snapshot)); }),
    listSnapshots: vi.fn(async () => structuredClone(snapshots).sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))),
    deleteSnapshot: vi.fn(async id => { events.push(`delete:${id}`); snapshots = snapshots.filter(snapshot => snapshot.id !== id); }),
    getTotalSnapshotSize: vi.fn(async () => snapshots.reduce((sum, snapshot) => sum + snapshot.size, 0)),
    getDraft: vi.fn(async () => structuredClone(draft)),
    putDraft: vi.fn(async value => { events.push('putDraft'); draft = structuredClone(value); }),
    clearDraft: vi.fn(async () => { events.push('clearDraft'); draft = null; }),
    getSettings: vi.fn(async () => structuredClone(settings)),
    setSettings: vi.fn(async value => { settings = structuredClone(value); }),
  };
  return { storage, events };
}

export function fakeFormats(): FormatsApi {
  function codec<K extends DocKind>(kind: K): FormatCodec<K> {
    return {
      kind, detect: fileName => fileName.endsWith(kind === 'lorebook' ? '.json' : `.${kind}`),
      parse: vi.fn(bytes => ({ doc: JSON.parse(new TextDecoder().decode(bytes)) as DocumentOf<K>, preserved: payload })),
      build: vi.fn(doc => new TextEncoder().encode(JSON.stringify(doc))),
    };
  }
  return {
    registry: { charx: codec('charx'), risum: codec('risum'), lorebook: codec('lorebook') },
    detectKind: vi.fn(fileName => fileName.endsWith('.charx') ? 'charx' : fileName.endsWith('.risum') ? 'risum'
      : fileName.endsWith('.json') ? 'lorebook' : null),
    getAvailableTabs: doc => doc.kind === 'lorebook' ? ['lorebook']
      : doc.kind === 'risum' ? ['module', 'lorebook', 'regex', 'trigger']
        : doc.module ? ['card', 'module', 'lorebook', 'regex', 'trigger'] : ['card', 'lorebook'],
    validate: vi.fn(() => []),
  };
}

export function context(initial: WorkspaceRecord | null = workspace()) {
  const { storage, events } = fakeStorage(initial);
  const formats = fakeFormats();
  let id = 0;
  const deps = {
    storage, formats, now: () => Date.now(), newId: () => String(++id).padStart(4, '0'),
    sha256Hex: vi.fn(async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')),
    download: vi.fn(async () => { events.push('download'); }),
  };
  return { ...deps, deps, events };
}

export const input = (doc = document()) => ({ fileName: 'new.json', bytes: new TextEncoder().encode(JSON.stringify(doc)) });
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
