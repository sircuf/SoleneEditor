import type { EditorStores } from '$contracts';

export interface PendingEdit {
  readonly hasPending: boolean;
  readonly ready: boolean;
  schedule(): void;
  pause(): void;
  markPending(): void;
  flush(): boolean;
  cancel(): void;
}

const editors = new WeakMap<EditorStores, Set<PendingEdit>>();

/** Read the latest local buffer at commit time, never a captured keystroke. */
export function createPendingEdit(commit: () => void, isComposing: () => boolean): PendingEdit {
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function pause(): void { clearTimeout(timer); timer = undefined; }
  const edit: PendingEdit = {
    get hasPending() { return pending; },
    get ready() { return !isComposing(); },
    pause,
    markPending() { pause(); pending = true; },
    schedule() { edit.markPending(); timer = setTimeout(() => edit.flush(), 300); },
    flush() {
      if (!edit.ready) return false;
      pause();
      if (!pending) return true;
      pending = false;
      try { commit(); return true; }
      catch { pending = true; return false; /* The contract publishes status.error. */ }
    },
    cancel() { pause(); pending = false; },
  };
  return edit;
}

export function registerPendingEdit(stores: EditorStores, edit: PendingEdit): () => void {
  let registered = editors.get(stores);
  if (!registered) { registered = new Set(); editors.set(stores, registered); }
  registered.add(edit);
  return () => { registered.delete(edit); if (!registered.size) editors.delete(stores); };
}

/** A composing editor blocks the action without committing partial text. */
export function flushPendingEdits(stores: EditorStores): boolean {
  const registered = [...(editors.get(stores) ?? [])];
  if (registered.some((edit) => !edit.ready)) return false;
  return registered.every((edit) => edit.flush());
}

export function hasPendingEdits(stores: EditorStores): boolean {
  return [...(editors.get(stores) ?? [])].some((edit) => edit.hasPending);
}
