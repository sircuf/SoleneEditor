import type { EditableDocument } from './document';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  /** RFC 6901 JSON Pointer into EditableDocument; "" means the whole document. */
  path: string;
  message: string;
}

/** Pure, nonmutating. Errors block export; warnings allow export. */
export type ValidateDocument = (doc: EditableDocument) => ValidationIssue[];
