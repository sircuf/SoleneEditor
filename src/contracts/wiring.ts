import type { DocKind, GetAvailableTabs } from './document';
import type { FormatRegistry } from './format';
import type {
  AutosaveService,
  DownloadFile,
  ExportService,
  ImportService,
  SnapshotService,
} from './services';
import type { Storage } from './storage';
import type { EditorStores } from './stores';
import type { ValidateDocument } from './validate';

/** Fixed public formats entry point; implementations remain pure TypeScript. */
export interface FormatsApi {
  registry: FormatRegistry;
  /** Nonthrowing candidate detection: charx -> risum -> lorebook, else null. */
  detectKind(fileName: string, bytes: Uint8Array): DocKind | null;
  getAvailableTabs: GetAvailableTabs;
  validate: ValidateDocument;
}

/** Inject adapters so services can be built without other layers' implementations. */
export interface ServiceDeps {
  storage: Storage;
  formats: FormatsApi;
  download: DownloadFile;
  /** Unix milliseconds. */
  now(): number;
  newId(): string;
  /** SHA-256 lowercase hex; canonical JSON encoding remains services' responsibility. */
  sha256Hex(bytes: Uint8Array): Promise<string>;
}

export interface Services {
  import: ImportService;
  export: ExportService;
  snapshot: SnapshotService;
  autosave: AutosaveService;
}

export type CreateServices = (deps: ServiceDeps) => Services;

export interface EditorStoresDeps {
  storage: Storage;
  services: Services;
  formats: FormatsApi;
  /** Browser File adapter; no File reading inside services or formats. */
  readFile(file: File): Promise<Uint8Array>;
}

export type CreateEditorStores = (deps: EditorStoresDeps) => EditorStores;
export type CreateStorage = () => Promise<Storage>;
