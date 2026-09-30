import { readonly, writable } from 'svelte/store';
import type {
  AppError, CreateEditorStores, DeepReadonly, DraftRecord, EditorStores, ExportResult,
  ItemAddress, JsonObject, Settings, SnapshotRecord, StatusState, TabId, UiState,
  WorkspaceRecord, WorkspaceView,
} from '$contracts';
import { collection, copyEditPath, guardReplacement, isJson, item, lorebookFormat, replaceItem, validItem } from './items';
import { detach, freezeOwned, immutable } from './immutable';

function sameAddress(a: ItemAddress, b: ItemAddress): boolean {
  return a.tab === b.tab && ('index' in a ? 'index' in b && a.index === b.index : !('index' in b))
    && ('format' in a ? 'format' in b && a.format === b.format : !('format' in b));
}

function validateSettings(settings: Settings) {
  if (!Number.isFinite(settings.snapshotIntervalMin) || settings.snapshotIntervalMin < 0
    || !Number.isFinite(settings.snapshotLimitMB) || settings.snapshotLimitMB <= 0
    || !['system', 'light', 'dark'].includes(settings.theme) || !['form', 'json'].includes(settings.editorMode)) {
    throw new Error('Invalid settings');
  }
}

export const createEditorStores: CreateEditorStores = ({ storage, services, formats, readFile }) => {
  let record: WorkspaceRecord | null = null;
  let currentDraft: DraftRecord | null = null;
  let currentSettings: Settings = { snapshotIntervalMin: 5, snapshotLimitMB: 100, theme: 'system', editorMode: 'form' };
  let currentUi: UiState = { activeTab: null, selectedIndex: null, editorMode: 'form', openDialog: null, busy: null };
  let currentStatus: StatusState = { dirty: false, lastSavedAt: null, error: null };
  let stagedFile: File | null = null;
  let unsubscribe: (() => void) | null = null;
  let draftTail: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let disposed = false;

  const workspaceStore = writable<WorkspaceView>({ record: null, tabs: [], lorebookFormat: null });
  const uiStore = writable(immutable(currentUi));
  const statusStore = writable(immutable(currentStatus));
  const settingsStore = writable(immutable(currentSettings));
  const snapshotsStore = writable<readonly DeepReadonly<SnapshotRecord>[]>([]);
  const draftStore = writable<DeepReadonly<DraftRecord> | null>(null);

  function publishUi() { uiStore.set(immutable(currentUi)); }
  function publishStatus() { statusStore.set(immutable(currentStatus)); }
  function publishWorkspace() {
    // record belongs to this store; its frozen history is reused by later path copies.
    workspaceStore.set(freezeOwned({
      record, tabs: record ? [...formats.getAvailableTabs(record.doc)] : [],
      lorebookFormat: record ? lorebookFormat(record.doc) : null,
    }));
    currentStatus.dirty = record?.dirty ?? false;
    publishStatus();
  }
  function surface(error: unknown) {
    const candidate = error as { code?: string; message?: string; issues?: AppError['issues'] } | null;
    currentStatus.error = {
      code: candidate?.code ?? 'command-failed', message: candidate?.message ?? String(error),
      ...(candidate?.issues ? { issues: candidate.issues } : {}),
    };
    publishStatus();
  }
  function sync<T>(operation: () => T): T {
    try { return operation(); } catch (error) { surface(error); throw error; }
  }
  async function asyncCommand<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) { surface(error); throw error; }
  }
  function gate() {
    if (disposed) throw new Error('Editor stores have been disposed');
    if (currentUi.busy) throw new Error(`Editor is busy: ${currentUi.busy}`);
  }
  function requireRecord(): WorkspaceRecord {
    if (!record) throw new Error('No workspace is open');
    return record;
  }
  function noDraft() { if (currentDraft) throw new Error('Resolve or discard the JSON draft first'); }
  function checkAddress(address: ItemAddress) {
    const workspace = requireRecord();
    if (!formats.getAvailableTabs(workspace.doc).includes(address.tab)) throw new Error('Tab is not available');
    return item(workspace.doc, address);
  }
  function draftWrite(operation: () => Promise<void>): Promise<void> {
    const result = draftTail.then(operation);
    draftTail = result.catch(surface);
    return result;
  }
  function scheduleSave() {
    const version = revision;
    void services.autosave.schedule(requireRecord()).then(result => {
      if (result && !disposed) {
        // Completion time is useful even after another edit; never replace the current doc.
        currentStatus.lastSavedAt = result.savedAt;
        publishStatus();
      }
    }).catch(error => { if (version === revision && !disposed) surface(error); });
  }
  function edited(next: WorkspaceRecord) {
    record = { ...next, dirty: true, updatedAt: Date.now() };
    ++revision;
    publishWorkspace();
    scheduleSave();
  }
  function choose(tab: TabId, index?: number | null) {
    const workspace = requireRecord();
    if (!formats.getAvailableTabs(workspace.doc).includes(tab)) throw new Error('Tab is not available');
    let selected: number | null = null;
    if (tab !== 'card' && tab !== 'module') {
      const target = tab === 'lorebook' ? { tab, format: lorebookFormat(workspace.doc) }
        : tab === 'regex' ? { tab } : { tab };
      const length = collection(workspace.doc, target).length;
      if (index !== undefined && index !== null && (!Number.isInteger(index) || index < 0 || index >= length)) {
        throw new Error('Item index is out of range');
      }
      selected = length ? index ?? 0 : null;
    } else if (index !== undefined && index !== null) throw new Error('Singleton tab has no item index');
    currentUi.activeTab = tab;
    currentUi.selectedIndex = selected;
    publishUi();
  }
  function resetSelection() {
    const tab = record ? formats.getAvailableTabs(record.doc)[0] : undefined;
    if (tab) choose(tab);
    else { currentUi.activeTab = null; currentUi.selectedIndex = null; publishUi(); }
  }
  function startIntervals() {
    services.snapshot.start(() => record ? structuredClone(record) : null, surface);
  }
  async function exclusive<T>(busy: NonNullable<UiState['busy']>, operation: () => Promise<T>): Promise<T> {
    gate();
    currentUi.busy = busy;
    publishUi();
    try {
      await services.snapshot.stop();
      await draftTail;
      return await operation();
    } finally {
      currentUi.busy = null;
      publishUi();
      if (!disposed) startIntervals();
    }
  }
  async function importFile(file: File) {
    const bytes = await readFile(file);
    const prepared = await services.import.prepare({ fileName: file.name, bytes });
    const imported = await services.import.commit(prepared);
    record = structuredClone(imported);
    ++revision;
    currentDraft = null;
    draftStore.set(null);
    currentStatus.lastSavedAt = Date.now();
    currentStatus.error = null;
    stagedFile = null;
    currentUi.openDialog = null;
    publishWorkspace();
    resetSelection();
    snapshotsStore.set(immutable(await services.snapshot.list()));
  }
  async function exportCurrent(): Promise<ExportResult> {
    noDraft();
    const saved = await services.autosave.flush();
    if (saved) currentStatus.lastSavedAt = saved.savedAt;
    const result = await services.export.export(requireRecord());
    if (result.status === 'exported') {
      record = structuredClone(result.workspace);
      ++revision;
      currentStatus.lastSavedAt = Date.now();
      currentStatus.error = null;
      publishWorkspace();
    } else {
      currentStatus.error = { code: 'validation-failed', message: 'Export validation failed', issues: result.issues };
      publishStatus();
    }
    return result;
  }

  const stores: EditorStores = {
    workspace: readonly(workspaceStore), ui: readonly(uiStore), status: readonly(statusStore),
    settings: readonly(settingsStore), snapshots: readonly(snapshotsStore), draft: readonly(draftStore),
    initialize: () => asyncCommand(async () => {
      gate();
      const [savedWorkspace, savedSettings, savedDraft, savedSnapshots] = await Promise.all([
        storage.getWorkspace(), storage.getSettings(), storage.getDraft(), services.snapshot.list(),
      ]);
      record = structuredClone(savedWorkspace);
      currentSettings = structuredClone(savedSettings);
      currentDraft = structuredClone(savedDraft);
      if (currentDraft) {
        try { checkAddress(currentDraft.address); }
        catch {
          await storage.clearDraft();
          currentDraft = null;
        }
      }
      currentUi.editorMode = currentDraft ? 'json' : currentSettings.editorMode;
      currentStatus.lastSavedAt = record?.updatedAt ?? null;
      settingsStore.set(immutable(currentSettings));
      draftStore.set(immutable(currentDraft));
      snapshotsStore.set(immutable(savedSnapshots));
      publishWorkspace();
      resetSelection();
      if (currentDraft && record) {
        const address = currentDraft.address;
        choose(address.tab, 'index' in address ? address.index : null);
      }
      unsubscribe?.();
      unsubscribe = services.snapshot.subscribe(snapshots => snapshotsStore.set(immutable(snapshots)));
      startIntervals();
    }),
    dispose: () => asyncCommand(async () => {
      gate();
      disposed = true;
      try {
        await services.autosave.flush();
        await draftTail;
      } finally {
        await services.snapshot.stop();
        unsubscribe?.();
        unsubscribe = null;
      }
    }),
    select: (tab, index) => sync(() => {
      gate();
      if (currentDraft) return false;
      choose(tab, index);
      return true;
    }),
    updateItem: (address, value) => sync(() => {
      gate(); noDraft();
      const old = checkAddress(address);
      if (!validItem(address, value)) throw new Error('Invalid item structure or non-JSON value');
      guardReplacement(address, old, value);
      const current = requireRecord();
      const next = { ...current, doc: copyEditPath(current.doc, address) } as WorkspaceRecord;
      replaceItem(next.doc, address, detach(value));
      edited(next);
    }),
    addItem: (target, value) => sync(() => {
      gate(); noDraft();
      const workspace = requireRecord();
      if (!formats.getAvailableTabs(workspace.doc).includes(target.tab)) throw new Error('Tab is not available');
      if (!validItem(target, value)) throw new Error('Invalid item structure or non-JSON value');
      const next = { ...workspace, doc: copyEditPath(workspace.doc, target) } as WorkspaceRecord;
      const list = collection(next.doc, target, true);
      const index = list.length;
      list.push(detach(value));
      edited(next);
      choose(target.tab, index);
      return index;
    }),
    removeItem: address => sync(() => {
      gate(); noDraft(); checkAddress(address);
      const current = requireRecord();
      const next = { ...current, doc: copyEditPath(current.doc, address) } as WorkspaceRecord;
      const list = collection(next.doc, address);
      list.splice(address.index, 1);
      if (currentUi.activeTab === address.tab) {
        const selected = currentUi.selectedIndex;
        currentUi.selectedIndex = list.length === 0 ? null
          : selected === null ? 0 : Math.min(selected > address.index ? selected - 1 : selected, list.length - 1);
      }
      edited(next);
      publishUi();
    }),
    setCardField: (field, value) => sync(() => {
      gate(); noDraft();
      if (field.includes('.')) throw new Error('Card field must be a direct key');
      if (!isJson(value)) throw new Error('Card field must contain JSON');
      stores.updateCard({ [field]: value });
    }),
    updateCard: patch => sync(() => {
      gate(); noDraft();
      const old = checkAddress({ tab: 'card' });
      const value: JsonObject = { ...old };
      for (const [key, child] of Object.entries(patch)) {
        if (child !== undefined) Object.defineProperty(value, key, { value: child, enumerable: true, writable: true, configurable: true });
      }
      stores.updateItem({ tab: 'card' }, value);
    }),
    updateJson: (address, text) => sync(() => {
      gate();
      const old = checkAddress(address);
      if (currentDraft && !sameAddress(currentDraft.address, address)) throw new Error('A draft blocks editing another item');
      let value: unknown;
      try { value = JSON.parse(text); } catch { /* Incomplete text is a persisted draft. */ }
      if (!validItem(address, value)) {
        currentDraft = { address: structuredClone(address), text, updatedAt: Date.now() };
        draftStore.set(immutable(currentDraft));
        currentUi.editorMode = 'json';
        publishUi();
        const detached = structuredClone(currentDraft);
        void draftWrite(() => storage.putDraft(detached)).catch(() => {});
        return false;
      }
      guardReplacement(address, old, value);
      const current = requireRecord();
      const next = { ...current, doc: copyEditPath(current.doc, address) } as WorkspaceRecord;
      replaceItem(next.doc, address, detach(value));
      currentDraft = null;
      draftStore.set(null);
      void draftWrite(() => storage.clearDraft()).catch(() => {});
      edited(next);
      return true;
    }),
    discardDraft: () => asyncCommand(async () => {
      gate();
      await draftWrite(() => storage.clearDraft());
      currentDraft = null;
      draftStore.set(null);
    }),
    requestImport: file => asyncCommand(async () => {
      gate();
      if (record) {
        stagedFile = file;
        currentUi.openDialog = { kind: 'import-confirm', fileName: file.name };
        publishUi();
      } else await exclusive('import', () => importFile(file));
    }),
    confirmImport: choice => asyncCommand(async () => {
      gate();
      if (!stagedFile || currentUi.openDialog?.kind !== 'import-confirm') throw new Error('No import is pending');
      if (choice === 'cancel') {
        stagedFile = null; currentUi.openDialog = null; publishUi(); return;
      }
      if (choice !== 'continue' && choice !== 'export-then-continue') throw new Error('Invalid import choice');
      const file = stagedFile;
      await exclusive('import', async () => {
        if (choice === 'export-then-continue') {
          const result = await exportCurrent();
          if (result.status !== 'exported') {
            throw Object.assign(new Error('Export validation failed'), { code: 'validation-failed', issues: result.issues });
          }
        }
        await importFile(file);
      });
    }),
    exportFile: () => asyncCommand(async () => {
      gate(); noDraft(); requireRecord();
      return exclusive('export', exportCurrent);
    }),
    takeManualSnapshot: label => asyncCommand(async () => {
      gate();
      const result = await services.snapshot.take(requireRecord(), 'manual', label);
      if (!result) throw new Error('Manual snapshot was not saved');
      return result;
    }),
    restoreSnapshot: id => asyncCommand(async () => {
      gate(); requireRecord();
      await exclusive('restore', async () => {
        const saved = await services.autosave.flush();
        if (saved) currentStatus.lastSavedAt = saved.savedAt;
        record = structuredClone(await services.snapshot.restore(requireRecord(), id));
        ++revision;
        currentDraft = null;
        draftStore.set(null);
        currentStatus.lastSavedAt = Date.now();
        currentStatus.error = null;
        currentUi.openDialog = null;
        publishWorkspace();
        resetSelection();
      });
    }),
    deleteSnapshot: id => asyncCommand(async () => { gate(); await services.snapshot.remove(id); }),
    setEditorMode: mode => asyncCommand(async () => {
      gate();
      if (currentDraft) return false;
      await stores.updateSettings({ editorMode: mode });
      return true;
    }),
    updateSettings: patch => asyncCommand(async () => {
      gate();
      const next = { ...currentSettings, ...structuredClone(patch) };
      validateSettings(next);
      if (currentDraft && patch.editorMode !== undefined && patch.editorMode !== currentUi.editorMode) {
        throw new Error('A draft blocks changing editor mode');
      }
      await services.snapshot.stop();
      try {
        await storage.setSettings(next);
        currentSettings = next;
        currentUi.editorMode = currentDraft ? 'json' : next.editorMode;
        settingsStore.set(immutable(currentSettings));
        publishUi();
        await services.snapshot.enforceRetention();
      } finally { startIntervals(); }
    }),
    openDialog: dialog => sync(() => {
      gate();
      if (currentUi.openDialog?.kind === 'import-confirm') throw new Error('Resolve import confirmation first');
      currentUi.openDialog = structuredClone(dialog);
      publishUi();
    }),
    closeDialog: () => sync(() => {
      gate();
      if (currentUi.openDialog?.kind === 'import-confirm') throw new Error('Cancel import through confirmImport');
      currentUi.openDialog = null;
      publishUi();
    }),
    clearError() { currentStatus.error = null; publishStatus(); },
  };
  return stores;
};
