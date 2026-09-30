/** Commands publish failures through status.error; consume rejections at the UI boundary. */
export async function perform(action: () => unknown | Promise<unknown>): Promise<void> {
  try { await action(); } catch { /* EditorStores exposes the error toast. */ }
}
