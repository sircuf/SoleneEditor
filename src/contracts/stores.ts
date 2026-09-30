import type {
  CharacterCardData,
  CollectionAddress,
  CollectionTarget,
  DeepReadonly,
  ItemAddress,
  ItemValue,
  JsonValue,
  LorebookFormat,
  TabId,
} from './document';
import type { DraftRecord, EditorMode, Settings, SnapshotRecord, WorkspaceRecord } from './storage';
import type { ExportResult } from './services';
import type { ValidationIssue } from './validate';

/** Structural Svelte-readable contract without a runtime dependency on Svelte. */
export interface ReadableState<T> {
  subscribe(run: (value: T) => void, invalidate?: (value?: T) => void): () => void;
}

export interface WorkspaceView {
  record: DeepReadonly<WorkspaceRecord> | null;
  /** Ordered per GetAvailableTabs; [] with no workspace. */
  tabs: readonly TabId[];
  /** null when no workspace; resolves the lorebook address/value representation. */
  lorebookFormat: LorebookFormat | null;
}

export type OpenDialog =
  | { kind: 'import-confirm'; fileName: string }
  | { kind: 'snapshots' }
  | { kind: 'settings' }
  | { kind: 'restore-confirm'; snapshotId: string };

export interface UiState {
  activeTab: TabId | null;
  /** Zero-based collection index; null for card/module or an empty collection. */
  selectedIndex: number | null;
  editorMode: EditorMode;
  openDialog: OpenDialog | null;
  /** Mutating commands are blocked while an import/export/restore is in flight. */
  busy: 'import' | 'export' | 'restore' | null;
}

export interface AppError {
  code: string;
  message: string;
  /** Optional validation details; never expose preserved/binary data to UI. */
  issues?: readonly ValidationIssue[];
}

export interface StatusState {
  /** Mirrors workspace.record.dirty, false when empty. */
  dirty: boolean;
  lastSavedAt: number | null;
  error: AppError | null;
}

export type ImportChoice = 'export-then-continue' | 'continue' | 'cancel';

/**
 * THE ONLY UI boundary. Components never import formats/storage/services or
 * mutable stores. Commands clone their inputs, preserve unknown keys, mark valid
 * document edits dirty and schedule autosave. Invalid addresses/kinds/indices or
 * edits to asset references fail without mutation. Expose failures in status and
 * reject async commands; synchronous commands throw on invalid inputs.
 */
export interface EditorStores {
  readonly workspace: ReadableState<WorkspaceView>;
  readonly ui: ReadableState<DeepReadonly<UiState>>;
  readonly status: ReadableState<DeepReadonly<StatusState>>;
  readonly settings: ReadableState<DeepReadonly<Settings>>;
  readonly snapshots: ReadableState<readonly DeepReadonly<SnapshotRecord>[]>;
  readonly draft: ReadableState<DeepReadonly<DraftRecord> | null>;

  /** Load workspace/settings/draft/snapshots, then start interval snapshots. */
  initialize(): Promise<void>;
  /** Flush autosave, stop/await interval work, unsubscribe listeners. */
  dispose(): Promise<void>;
  /** Default to the first item; false if an invalid JSON draft blocks navigation. */
  select(tab: TabId, index?: number | null): boolean;
  /**
   * Replace a complete item, not a partial merge. UI must retain unknown keys.
   * card means card.data; module means envelope.module, not the full envelope.
   * A Risu/CCv3 lorebook address must match workspace.lorebookFormat.
   */
  updateItem<T extends ItemAddress>(address: T, value: ItemValue<T>): void;
  /** Append to a collection (create a missing optional collection only on edit). */
  addItem<T extends CollectionTarget>(target: T, value: ItemValue<T>): number;
  /** Adjust selectedIndex after deletion; an empty list selects null. */
  removeItem(address: CollectionAddress): void;
  /** Direct data.* field, not a dotted path; asset reference edits are forbidden. */
  setCardField(field: string, value: JsonValue): void;
  /** Shallow patch card.data, preserving every key not in the patch. */
  updateCard(patch: Partial<CharacterCardData>): void;
  /**
   * Parse selected item JSON. Valid input updates item and clears draft; invalid
   * input only persists DraftRecord and keeps the last valid document unchanged.
   * Returns true for valid input. Reject binary/unknown-loss/asset reference edits.
   */
  updateJson(address: ItemAddress, text: string): boolean;
  discardDraft(): Promise<void>;

  /**
   * With ANY existing workspace, stage File privately and show import-confirm.
   * With no workspace, prepare then commit directly. Failed parsing never deletes
   * existing data. Await existing background writes before replacement; reset
   * selection to the first available tab, lastSavedAt to the new save time.
   */
  requestImport(file: File): Promise<void>;
  /**
   * cancel discards staged File; continue prepares/commits; export-then-continue
   * exports the current doc first and continues ONLY on successful export.
   * Failed export/parse leaves current work intact and keeps the dialog pending.
   */
  confirmImport(choice: ImportChoice): Promise<void>;
  /** An unresolved JSON draft blocks export; flush autosave before exporting. */
  exportFile(): Promise<ExportResult>;
  takeManualSnapshot(label?: string): Promise<SnapshotRecord>;
  /** Before-restore save is mandatory; preserved binaries never change. */
  restoreSnapshot(id: string): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
  /** false while an invalid JSON draft exists; otherwise persist mode setting. */
  setEditorMode(mode: EditorMode): Promise<boolean>;
  /** Validate ranges, persist, restart interval timer and enforce new size limit. */
  updateSettings(patch: Partial<Settings>): Promise<void>;
  openDialog(dialog: Exclude<OpenDialog, { kind: 'import-confirm' }>): void;
  /** Import confirmation must close through confirmImport('cancel'). */
  closeDialog(): void;
  clearError(): void;
}
