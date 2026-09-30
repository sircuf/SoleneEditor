import type { DocKind, DocumentOf, EditableDocument, ItemAddress } from './document';
import type { PreservedPayload } from './format';

/** All times are Unix milliseconds. Null means the event has never happened. */
export interface WorkspaceMetadata {
  fileName: string;
  /** Changed since the last successful export; autosaving never clears this. */
  dirty: boolean;
  lastExportedAt: number | null;
  updatedAt: number;
}

/** kind and doc.kind are correlated at the type level. */
export type WorkspaceRecord = WorkspaceMetadata & {
  [K in DocKind]: { kind: K; doc: DocumentOf<K> }
}[DocKind];

export type SnapshotReason =
  | 'original'
  | 'interval'
  | 'manual'
  | 'export'
  | 'before-restore'
  | 'before-bulk';

export interface SnapshotRecord {
  id: string;
  time: number;
  label: string;
  pinned: boolean;
  reason: SnapshotReason;
  /** Detached JSON-only copy; no fileName, dirty state, or binary payload. */
  doc: EditableDocument;
  /** UTF-8 byte count of canonical doc JSON, not the whole record or binaries. */
  size: number;
  /** SHA-256 lowercase hex of that canonical JSON, for change detection. */
  contentHash: string;
}

export type EditorMode = 'form' | 'json';

export interface Settings {
  /** Nonnegative minutes; 0 disables interval snapshots. Default: 5. */
  snapshotIntervalMin: number;
  /** Positive MiB (1 MiB = 1024 * 1024 bytes). Default: 100. */
  snapshotLimitMB: number;
  theme: 'system' | 'light' | 'dark';
  editorMode: EditorMode;
}

/** One invalid/incomplete item JSON draft for the active workspace. */
export interface DraftRecord {
  address: ItemAddress;
  text: string;
  updatedAt: number;
}

export interface WorkspaceReplacement {
  metadata: WorkspaceMetadata;
  /** Pinned original snapshot whose doc must match the replacement doc. */
  original: SnapshotRecord;
}

/**
 * Async storage boundary. IndexedDB stores workspace/snapshots/preserved/draft;
 * localStorage stores settings. Return detached values, never live references.
 * Adapters catch persistence failures and retain a consistent in-memory fallback
 * so blocked storage does not prevent editing. Request persistent storage at
 * adapter initialization when available. No browser globals in formats.
 */
export interface Storage {
  getWorkspace(): Promise<WorkspaceRecord | null>;
  putWorkspace(workspace: WorkspaceRecord): Promise<void>;
  /**
   * One transaction: clear old workspace, snapshots, preserved, and draft;
   * insert the new workspace, preserved, and pinned original snapshot.
   * On failure preserve the entire old workspace (also in the memory fallback).
   * Only import calls this; restore/edits use putWorkspace, retaining binaries.
   */
  replaceWorkspace(
    doc: EditableDocument,
    preserved: PreservedPayload,
    replacement: WorkspaceReplacement,
  ): Promise<WorkspaceRecord>;
  getPreserved(): Promise<PreservedPayload | null>;
  addSnapshot(snapshot: SnapshotRecord): Promise<void>;
  /** Oldest first, ordered by time then id ascending; detached JSON copies. */
  listSnapshots(): Promise<SnapshotRecord[]>;
  deleteSnapshot(id: string): Promise<void>;
  /** Sum of size across ALL snapshots, including pinned ones. */
  getTotalSnapshotSize(): Promise<number>;
  getDraft(): Promise<DraftRecord | null>;
  putDraft(draft: DraftRecord): Promise<void>;
  clearDraft(): Promise<void>;
  /** Return defaults for missing/invalid settings: 5, 100, system, form. */
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;
}
