// Reference: kwaroran/RisuAI src/ts/process/lorebook.svelte.ts,
// importLoreBook/exportLoreBook (main @ f9728b1, GPL-3.0).
import { FormatError } from '$contracts';
import type { FormatCodec, RisuLorebook } from '$contracts';
import { assertAddressable, assertDocument, assertPreserved, isObject, jsonBytes, parseJson, preserve } from './shared';

const schema = 'solene-lorebook-v1';

export const lorebook: FormatCodec<'lorebook'> = {
  kind: 'lorebook',
  detect(fileName, bytes) {
    if (/\.(json|lorebook)$/i.test(fileName)) return true;
    try {
      const value = parseJson(bytes);
      return isObject(value) && value.type === 'risu';
    } catch {
      return false;
    }
  },
  parse(bytes) {
    const book = parseJson(bytes);
    const doc = { kind: 'lorebook' as const, book: book as RisuLorebook };
    assertAddressable(doc, 'lorebook');
    return { doc, preserved: preserve('lorebook', [], { schema }) };
  },
  build(doc, preserved) {
    assertDocument(doc, 'lorebook');
    assertPreserved(preserved, 'lorebook', schema);
    if (preserved.entries.length !== 0) throw new FormatError('preserved-payload-mismatch', '로어북에는 바이너리가 없어요.');
    return jsonBytes(doc.book);
  },
};
