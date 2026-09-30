// Format port: kwaroran/RisuAI src/ts/process/modules.ts, readModule and
// exportModuleLegacy (main @ f9728b1, GPL-3.0). rpack uses AGPL-3.0.
import { FormatError } from '$contracts';
import type { FormatCodec, PreservedEntry, RisuModuleEnvelope } from '$contracts';
import { decodeRPack, encodeRPack } from './rpack';
import {
  assertAddressable, assertAssetReferences, assertDocument, assertPreserved, cloneJson, concatBytes,
  jsonBytes, parseJson, preserve,
} from './shared';

const schema = 'solene-risum-v1';

export const risum: FormatCodec<'risum'> = {
  kind: 'risum',
  detect(fileName, bytes) {
    return /\.risum$/i.test(fileName) || (bytes[0] === 111 && bytes[1] === 0);
  },
  parse(bytes) {
    let position = 0;
    const requireBytes = (length: number) => {
      if (position + length > bytes.length) throw new FormatError('invalid-container', 'risum 데이터가 잘렸어요.');
    };
    const byte = () => { requireBytes(1); return bytes[position++]; };
    const length = () => {
      requireBytes(4);
      const result = new DataView(bytes.buffer, bytes.byteOffset + position, 4).getUint32(0, true);
      position += 4;
      return result;
    };
    if (byte() !== 111) throw new FormatError('invalid-container', 'risum 매직 넘버가 올바르지 않아요.');
    if (byte() !== 0) throw new FormatError('unsupported-version', '지원하지 않는 risum 버전이에요.');
    const mainLength = length();
    requireBytes(mainLength);
    const main = parseJson(decodeRPack(bytes.subarray(position, position + mainLength)));
    position += mainLength;
    const doc = { kind: 'risum' as const, module: main as RisuModuleEnvelope };
    assertAddressable(doc, 'risum');
    const entries: PreservedEntry[] = [];
    while (true) {
      const start = position;
      const mark = byte();
      if (mark === 0) break;
      if (mark !== 1) throw new FormatError('invalid-container', 'risum 에셋 표시가 올바르지 않아요.');
      const assetLength = length();
      requireBytes(assetLength);
      position += assetLength;
      entries.push({ name: `risum:block:${entries.length}`, bytes: bytes.slice(start, position) });
    }
    if (position !== bytes.length) throw new FormatError('invalid-container', 'risum 종료 표시 뒤에 데이터가 있어요.');
    return {
      doc,
      preserved: preserve('risum', entries, {
        schema,
        assetReferences: cloneJson(doc.module.module.assets ?? null),
      }),
    };
  },
  build(doc, preserved) {
    assertDocument(doc, 'risum');
    assertPreserved(preserved, 'risum', schema);
    assertAssetReferences(doc.module.module.assets, preserved.metadata.assetReferences);
    if (preserved.entries.length !== (doc.module.module.assets?.length ?? 0)) {
      throw new FormatError('preserved-payload-mismatch', '에셋 블록 개수가 맞지 않아요.');
    }
    const main = encodeRPack(jsonBytes(doc.module, 2));
    const header = new Uint8Array(6);
    header[0] = 111;
    new DataView(header.buffer).setUint32(2, main.length, true);
    return concatBytes([header, main, ...preserved.entries.map((entry) => entry.bytes), new Uint8Array([0])]);
  },
};
