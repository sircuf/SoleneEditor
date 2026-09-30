import type { EditableDocument } from './document';
import type { PreservedPayload } from './format';
import type { SnapshotReason, SnapshotRecord, WorkspaceRecord } from './storage';
import type { ValidationIssue } from './validate';

/** Browser File reading belongs above services; services receive name + bytes. */
export interface ImportInput {
  fileName: string;
  bytes: Uint8Array;
}

export interface PreparedImport {
  fileName: string;
  doc: EditableDocument;
  preserved: PreservedPayload;
}

export interface ImportService {
  /** Detect and parse completely. No storage writes or deletion, even on failure. */
  prepare(input: ImportInput): Promise<PreparedImport>;
  /**
   * Only accepts a successful prepare result. Atomically replace via Storage,
   * including a pinned original snapshot; dirty=false, lastExportedAt=null.
   * Cancel/await old autosave and interval work before committing, so it cannot
   * repopulate the new workspace with stale writes. Restart intervals afterward.
   */
  commit(prepared: PreparedImport): Promise<WorkspaceRecord>;
}

/** Inject a browser adapter; resolution means download initiation succeeded. */
export type DownloadFile = (fileName: string, bytes: Uint8Array) => Promise<void>;

export type ExportResult =
  | { status: 'invalid'; issues: ValidationIssue[] }
  | {
      status: 'exported';
      workspace: WorkspaceRecord;
      snapshot: SnapshotRecord;
      issues: ValidationIssue[];
    };

export interface ExportService {
  /**
   * validate -> (no errors) get preserved -> build -> await download adapter ->
   * pinned export snapshot -> persist dirty=false and lastExportedAt.
   * Warnings permit export. Invalid returns without side effects; other failures
   * reject and never clear dirty. A browser cannot confirm the user saved a file.
   * Build receives a detached doc. Export never overwrites the editable source
   * with its derived character_book. Keep the imported filename/container suffix.
   * Caller flushes autosave and blocks edits/import/restore until completion.
   */
  export(workspace: WorkspaceRecord): Promise<ExportResult>;
}

/**
 * Canonical JSON: recursively sort object keys in UTF-16 code-unit order; retain
 * array order and use compact JSON.stringify scalar encoding. No Unicode
 * normalization. Encode UTF-8, then SHA-256. size measures precisely these bytes.
 * This rule covers the entire EditableDocument, including unknown JSON fields.
 */
export interface SnapshotService {
  /**
   * Persist detached JSON; original/manual/export are pinned, other reasons are
   * unpinned. Only interval may return null: same hash as the newest snapshot.
   * Then prune oldest-first (time, id), excluding pinned, until total size fits
   * settings.snapshotLimitMB * 1024 * 1024. Pinned-only overflow is allowed.
   */
  take(workspace: WorkspaceRecord, reason: SnapshotReason, label?: string): Promise<SnapshotRecord | null>;
  list(): Promise<SnapshotRecord[]>;
  /** Explicit user deletion may delete pinned snapshots; automatic pruning cannot. */
  remove(id: string): Promise<void>;
  /** Apply current size limit even when interval snapshots are disabled. */
  enforceRetention(): Promise<void>;
  /**
   * Resolve snapshot only from this workspace and require matching kind.
   * Save current doc as before-restore FIRST; a failed save aborts restoration.
   * Then putWorkspace with the restored detached doc, dirty=true, new updatedAt;
   * retain filename, lastExportedAt, and preserved payload. Clear the old draft.
   * Caller flushes autosave and pauses intervals/edits until completion.
   */
  restore(workspace: WorkspaceRecord, snapshotId: string): Promise<WorkspaceRecord>;
  /**
   * Start one timer using current settings; 0 means off. Get latest workspace
   * each tick, never capture an old document. Restart after settings/import changes.
   * Serialize take/prune/restore work; failures go to onError, not unhandled promises.
   */
  start(getWorkspace: () => WorkspaceRecord | null, onError: (error: unknown) => void): void;
  /** Stop the timer AND await any running interval work before workspace replacement. */
  stop(): Promise<void>;
  /** Notify after add/prune/delete, so stores can refresh their snapshot view. */
  subscribe(listener: (snapshots: SnapshotRecord[]) => void): () => void;
}

export interface AutosaveResult {
  workspace: WorkspaceRecord;
  savedAt: number;
}

export interface AutosaveService {
  /**
   * 1000 ms debounce, detached record, dirty unchanged. Superseded/cancelled
   * schedules resolve null; a completed save resolves its actual completion time.
   * Serialize storage writes so an older completion cannot overwrite a newer edit.
   */
  schedule(workspace: WorkspaceRecord): Promise<AutosaveResult | null>;
  /** Immediately save the latest queued record and await running writes. */
  flush(): Promise<AutosaveResult | null>;
  /** Drop queued writes and await running ones before import; do not save stale data. */
  cancel(): Promise<void>;
}
