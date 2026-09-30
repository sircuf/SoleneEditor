import { get, writable } from 'svelte/store';
import type {
  CollectionTarget, EditableDocument, EditorStores, ItemAddress, JsonObject,
  Settings, SnapshotRecord, StatusState, UiState, ValidationIssue, WorkspaceRecord, WorkspaceView,
} from '$contracts';
import { collectionFor, itemFor, targetFor } from '../components/view';
import { sampleCharx, sampleLorebook, sampleRisum } from './samples';

export interface MockOptions {
  doc?: EditableDocument | null;
  dirty?: boolean;
  settings?: Partial<Settings>;
  exportIssues?: ValidationIssue[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function view(record: WorkspaceRecord | null): WorkspaceView {
  if (!record) return { record: null, tabs: [], lorebookFormat: null };
  const doc = record.doc;
  return {
    record,
    tabs: doc.kind === 'lorebook' ? ['lorebook'] : doc.kind === 'risum'
      ? ['module', 'lorebook', 'regex', 'trigger'] : doc.module
        ? ['card', 'module', 'lorebook', 'regex', 'trigger'] : ['card', 'lorebook'],
    lorebookFormat: doc.kind === 'charx' && !doc.module ? 'character-book' : 'risu',
  };
}

function recordFor(doc: EditableDocument, fileName?: string, dirty = false): WorkspaceRecord {
  return {
    kind: doc.kind, doc: clone(doc), fileName: fileName ?? `sample.${doc.kind === 'lorebook' ? 'json' : doc.kind}`,
    dirty, lastExportedAt: null, updatedAt: Date.now(),
  } as WorkspaceRecord;
}

function mutableCollection(doc: EditableDocument, target: CollectionTarget): JsonObject[] {
  if (target.tab === 'lorebook' && target.format === 'character-book' && doc.kind === 'charx' && !doc.module) {
    doc.card.data.character_book ??= {};
    return doc.card.data.character_book.entries ??= [];
  }
  if (target.tab === 'lorebook' && target.format === 'risu' && doc.kind === 'lorebook') return doc.book.data;
  const module = doc.kind !== 'lorebook' ? doc.module?.module : null;
  if (!module) throw new Error('이 문서에는 해당 목록이 없어요.');
  switch (target.tab) {
    case 'lorebook': return module.lorebook ??= [];
    case 'regex': return module.regex ??= [];
    case 'trigger': return module.trigger ??= [];
  }
}

function hasShape(address: ItemAddress, item: JsonObject): boolean {
  const strings = (keys: string[]) => keys.every((key) => typeof item[key] === 'string');
  switch (address.tab) {
    case 'card': return ['name', 'description', 'first_mes'].every((key) => item[key] === undefined || typeof item[key] === 'string');
    case 'module': return strings(['name', 'description', 'id']);
    case 'lorebook': return address.format === 'character-book'
      ? (item.keys === undefined || (Array.isArray(item.keys) && item.keys.every((key) => typeof key === 'string')))
      : strings(['key', 'secondkey', 'comment', 'content', 'mode']) && typeof item.insertorder === 'number'
        && typeof item.alwaysActive === 'boolean' && typeof item.selective === 'boolean';
    case 'regex': return strings(['comment', 'in', 'out', 'type']);
    case 'trigger': return strings(['comment', 'type']) && Array.isArray(item.conditions) && Array.isArray(item.effect)
      && [...item.conditions, ...item.effect].every((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry));
  }
}

/** Development only: simulated imports/exports, no codecs, downloads, persistence, or timers. */
export function createMockStores(options: MockOptions = {}): EditorStores {
  const initialDoc = options.doc === undefined ? sampleCharx : options.doc;
  const workspace = writable<WorkspaceView>(view(initialDoc ? recordFor(initialDoc, undefined, options.dirty) : null));
  const settings = writable<Settings>({ snapshotIntervalMin: 5, snapshotLimitMB: 100, theme: 'system', editorMode: 'form', ...options.settings });
  const ui = writable<UiState>({ activeTab: get(workspace).tabs[0] ?? null, selectedIndex: initialDoc?.kind === 'lorebook' ? 0 : null,
    editorMode: get(settings).editorMode, openDialog: null, busy: null });
  const status = writable<StatusState>({ dirty: options.dirty ?? false, lastSavedAt: null, error: null });
  const snapshots = writable<SnapshotRecord[]>([]);
  const draft = writable<import('$contracts').DraftRecord | null>(null);
  let pendingFile: File | null = null;
  let nextId = 1;

  function fail(message: string): never {
    status.update((state) => ({ ...state, error: { code: 'mock-error', message } }));
    throw new Error(message);
  }

  function current(): WorkspaceRecord {
    const record = get(workspace).record;
    if (!record) return fail('먼저 파일을 가져와 주세요.');
    return clone(record) as WorkspaceRecord;
  }

  function guard(allowDraft = false): void {
    if (get(ui).busy) fail('작업이 끝날 때까지 기다려 주세요.');
    if (!allowDraft && get(draft)) fail('JSON 오류를 먼저 고쳐 주세요.');
  }

  function publish(record: WorkspaceRecord, dirty = true): void {
    record.dirty = dirty;
    record.updatedAt = Date.now();
    workspace.set(view(clone(record)));
    status.update((state) => ({ ...state, dirty, lastSavedAt: Date.now(), error: null }));
  }

  function snapshot(reason: SnapshotRecord['reason'], label = ''): SnapshotRecord {
    const doc = clone(current().doc);
    const json = JSON.stringify(doc);
    const record: SnapshotRecord = { id: `mock-${nextId++}`, time: Date.now(), label, reason,
      pinned: ['original', 'manual', 'export'].includes(reason), doc,
      size: new TextEncoder().encode(json).length, contentHash: '0'.repeat(64) };
    snapshots.update((list) => [...list, record]);
    return clone(record);
  }

  function validateAddress(address: ItemAddress): void {
    const state = get(workspace);
    if (!state.record || !state.tabs.includes(address.tab)) fail('선택한 탭이 없어요.');
    if (address.tab === 'lorebook' && address.format !== state.lorebookFormat) fail('로어북 형식이 맞지 않아요.');
    if ('index' in address && (!Number.isInteger(address.index) || address.index < 0)) fail('항목 번호가 올바르지 않아요.');
    if (!itemFor(state.record.doc, address)) fail('선택한 항목이 없어요.');
  }

  function replace(address: ItemAddress, value: JsonObject): void {
    validateAddress(address);
    if (!hasShape(address, value)) fail('항목의 필수 필드와 자료형을 확인해 주세요.');
    const record = current();
    const previous = itemFor(record.doc, address)!;
    if (['assets', 'icon', 'backgroundEmbedding'].some((key) => JSON.stringify(previous[key]) !== JSON.stringify(value[key]))) {
      fail('에셋 참조는 편집할 수 없어요.');
    }
    if (address.tab === 'card' && record.doc.kind === 'charx') record.doc.card.data = clone(value);
    else if (address.tab === 'module' && record.doc.kind !== 'lorebook' && record.doc.module) {
      record.doc.module.module = clone(value) as typeof record.doc.module.module;
    } else if ('index' in address) mutableCollection(record.doc, address)[address.index] = clone(value);
    publish(record);
  }

  async function commitImport(file: File): Promise<void> {
    ui.update((state) => ({ ...state, busy: 'import' }));
    try {
      // This mock intentionally picks a sample by suffix instead of parsing binary files.
      const extension = file.name.split('.').pop()?.toLowerCase();
      const doc = extension === 'json' ? sampleLorebook : extension === 'risum' ? sampleRisum
        : ['charx', 'jpg', 'jpeg'].includes(extension ?? '') ? sampleCharx : null;
      if (!doc) fail('지원하지 않는 파일 형식이에요.');
      const record = recordFor(doc, file.name);
      workspace.set(view(record));
      draft.set(null);
      snapshots.set([]);
      snapshot('original', '원본');
      status.set({ dirty: false, lastSavedAt: Date.now(), error: null });
      ui.set({ activeTab: get(workspace).tabs[0], selectedIndex: doc.kind === 'lorebook' ? 0 : null,
        editorMode: get(settings).editorMode, openDialog: null, busy: null });
      pendingFile = null;
    } finally {
      ui.update((state) => ({ ...state, busy: null }));
    }
  }

  const stores: EditorStores = {
    workspace, ui, status, settings, snapshots, draft,
    async initialize() {},
    async dispose() {},
    select(tab, index) {
      if (get(draft) || get(ui).busy || !get(workspace).tabs.includes(tab)) return false;
      const target = targetFor(tab, get(workspace));
      const list = target && get(workspace).record ? collectionFor(get(workspace).record!.doc, target) : [];
      const selectedIndex = target && list.length ? index ?? 0 : null;
      if (selectedIndex !== null && (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= list.length)) return false;
      ui.update((state) => ({ ...state, activeTab: tab, selectedIndex }));
      return true;
    },
    updateItem(address, value) { guard(); replace(address, value); },
    addItem(target, value) {
      guard();
      const state = get(workspace);
      if (!state.tabs.includes(target.tab) || (target.tab === 'lorebook' && target.format !== state.lorebookFormat)) fail('목록이 없어요.');
      const record = current();
      const list = mutableCollection(record.doc, target);
      if (!hasShape({ ...target, index: list.length }, value)) fail('항목의 자료형을 확인해 주세요.');
      list.push(clone(value));
      publish(record);
      stores.select(target.tab, list.length - 1);
      return list.length - 1;
    },
    removeItem(address) {
      guard(); validateAddress(address);
      const record = current();
      const list = mutableCollection(record.doc, address);
      list.splice(address.index, 1);
      publish(record);
      ui.update((state) => ({ ...state, selectedIndex: list.length ? Math.min(state.selectedIndex ?? 0, list.length - 1) : null }));
    },
    setCardField(field, value) {
      const record = current();
      if (record.doc.kind !== 'charx') fail('카드가 없어요.');
      stores.updateItem({ tab: 'card' }, { ...record.doc.card.data, [field]: clone(value) });
    },
    updateCard(patch) {
      const record = current();
      if (record.doc.kind !== 'charx') fail('카드가 없어요.');
      const value = { ...record.doc.card.data };
      for (const [key, entry] of Object.entries(patch)) if (entry !== undefined) value[key] = clone(entry);
      stores.updateItem({ tab: 'card' }, value);
    },
    updateJson(address, text) {
      guard(true); validateAddress(address);
      let value: unknown;
      try { value = JSON.parse(text); } catch { value = null; }
      if (!value || typeof value !== 'object' || Array.isArray(value) || !hasShape(address, value as JsonObject)) {
        draft.set({ address: clone(address), text, updatedAt: Date.now() });
        return false;
      }
      replace(address, value as JsonObject);
      draft.set(null);
      return true;
    },
    async discardDraft() { draft.set(null); },
    async requestImport(file) {
      if (get(ui).busy) fail('작업이 끝날 때까지 기다려 주세요.');
      if (get(workspace).record) {
        pendingFile = file;
        ui.update((state) => ({ ...state, openDialog: { kind: 'import-confirm', fileName: file.name } }));
      } else await commitImport(file);
    },
    async confirmImport(choice) {
      if (choice === 'cancel') {
        pendingFile = null;
        ui.update((state) => ({ ...state, openDialog: null }));
        return;
      }
      if (!pendingFile) fail('가져올 파일이 없어요.');
      if (choice === 'export-then-continue' && (await stores.exportFile()).status !== 'exported') return;
      await commitImport(pendingFile);
    },
    async exportFile() {
      guard();
      const issues = clone(options.exportIssues ?? []);
      if (issues.some((issue) => issue.severity === 'error')) {
        status.update((state) => ({ ...state, error: { code: 'validation', message: '오류를 고쳐야 내보낼 수 있어요.', issues } }));
        return { status: 'invalid', issues };
      }
      const record = current();
      const exported = snapshot('export', '내보낸 버전');
      record.lastExportedAt = Date.now();
      publish(record, false);
      return { status: 'exported', workspace: clone(record), snapshot: exported, issues };
    },
    async takeManualSnapshot(label) { guard(); return snapshot('manual', label); },
    async restoreSnapshot(id) {
      guard(true);
      const target = get(snapshots).find((entry) => entry.id === id);
      const record = current();
      if (!target || target.doc.kind !== record.kind) fail('복원할 스냅샷이 없어요.');
      snapshot('before-restore', '복원 전');
      record.doc = clone(target.doc);
      draft.set(null);
      publish(record);
      ui.update((state) => ({ ...state, activeTab: get(workspace).tabs[0], selectedIndex: record.kind === 'lorebook' && target.doc.kind === 'lorebook' && target.doc.book.data.length ? 0 : null, openDialog: { kind: 'snapshots' } }));
    },
    async deleteSnapshot(id) { snapshots.update((list) => list.filter((entry) => entry.id !== id)); },
    async setEditorMode(mode) {
      if (get(draft) || get(ui).busy) return false;
      ui.update((state) => ({ ...state, editorMode: mode }));
      settings.update((state) => ({ ...state, editorMode: mode }));
      return true;
    },
    async updateSettings(patch) {
      const next = { ...get(settings), ...patch };
      if (!Number.isFinite(next.snapshotIntervalMin) || next.snapshotIntervalMin < 0 || !Number.isFinite(next.snapshotLimitMB) || next.snapshotLimitMB <= 0) fail('스냅샷 설정 값을 확인해 주세요.');
      settings.set(next);
    },
    openDialog(dialog) { ui.update((state) => ({ ...state, openDialog: clone(dialog) })); },
    closeDialog() { if (get(ui).openDialog?.kind !== 'import-confirm') ui.update((state) => ({ ...state, openDialog: null })); },
    clearError() { status.update((state) => ({ ...state, error: null })); },
  };
  if (initialDoc) snapshot('original', '원본');
  return stores;
}
