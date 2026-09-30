import type { DocKind, DocumentOf, EditableDocument, JsonObject } from './document';

declare const preservedPayloadBrand: unique symbol;

export interface PreservedEntry {
  /** Format-private name: ZIP path or a stable identifier for JPEG/risum blocks. */
  readonly name: string;
  /** Original bytes; never recompress, decode/re-encode, or mutate them. */
  readonly bytes: Uint8Array;
}

/**
 * Structured-cloneable plain data, stored once in IndexedDB. This is NOT JSON.
 * Only formats may create, cast, inspect, or interpret it. Other layers only pass
 * it through. The brand is compile-time only (no symbol property to serialize).
 * metadata holds format-private JSON: entry ordering, nesting, asset pairing,
 * uneditable original references, etc. entries may include any preserved bytes.
 */
export type PreservedPayload = {
  readonly kind: DocKind;
  readonly entries: readonly PreservedEntry[];
  readonly metadata: JsonObject;
  readonly [preservedPayloadBrand]: true;
};

export interface ParseResult<K extends DocKind = DocKind> {
  doc: DocumentOf<K>;
  preserved: PreservedPayload;
}

/**
 * Synchronous, pure TS; no DOM, storage, Svelte, or services. detect is a
 * nonthrowing candidate check; parse is authoritative and throws FormatError.
 * Registry precedence is charx -> risum -> lorebook (including JPEG charx).
 * JSON whitespace/ZIP compression may change; JSON meaning and preserved bytes
 * must not. build must not mutate either argument.
 *
 * CHARX: if module exists, regenerate ONLY character_book.entries from
 * module.module.lorebook (absent lorebook means an empty list). Preserve all
 * character_book settings/extensions and retain any nonconflicting unknown
 * fields on existing entries through format-private provenance. The conversion
 * comes from RisuAI, not this contract. With module=null edit/build native CCv3
 * entries; never synthesize a module. Missing untouched fields stay absent.
 */
export interface FormatCodec<K extends DocKind = DocKind> {
  readonly kind: K;
  detect(fileName: string, bytes: Uint8Array): boolean;
  parse(bytes: Uint8Array, fileName: string): ParseResult<K>;
  build(doc: DocumentOf<K>, preserved: PreservedPayload): Uint8Array;
}

export type FormatRegistry = {
  readonly [K in DocKind]: FormatCodec<K>;
};

export type FormatErrorCode =
  | 'unsupported-format'
  | 'invalid-container'
  | 'invalid-json'
  | 'missing-required-data'
  | 'unsupported-version'
  | 'document-kind-mismatch'
  | 'preserved-payload-mismatch'
  | 'asset-reference-changed';

export class FormatError extends Error {
  readonly code: FormatErrorCode;

  constructor(code: FormatErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FormatError';
    this.code = code;
  }
}

/** Signature for a registry-dispatched builder; implementation lives in formats. */
export type BuildDocument = (doc: EditableDocument, preserved: PreservedPayload) => Uint8Array;
