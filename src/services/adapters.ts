/** A resolved promise confirms download initiation, not saving on the user's disk. */
export async function downloadFile(fileName: string, bytes: Uint8Array): Promise<void> {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const newId = (): string => crypto.randomUUID();
export const readFile = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());
