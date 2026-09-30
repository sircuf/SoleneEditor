import type {
  CollectionTarget, DeepReadonly, EditableDocument, ItemAddress, JsonObject,
  JsonValue, TabId, WorkspaceView,
} from '$contracts';

export function targetFor(tab: TabId, workspace: WorkspaceView): CollectionTarget | null {
  if (tab === 'lorebook' && workspace.lorebookFormat) {
    return { tab, format: workspace.lorebookFormat };
  }
  return tab === 'regex' || tab === 'trigger' ? { tab } : null;
}

export function collectionFor(
  doc: DeepReadonly<EditableDocument>, target: CollectionTarget,
): readonly DeepReadonly<JsonObject>[] {
  const module = doc.kind === 'lorebook' ? null : doc.module?.module;
  if (target.tab === 'lorebook') {
    if (target.format === 'character-book') {
      return doc.kind === 'charx' ? doc.card.data.character_book?.entries ?? [] : [];
    }
    return doc.kind === 'lorebook' ? doc.book.data : module?.lorebook ?? [];
  }
  return module?.[target.tab] ?? [];
}

export function itemFor(
  doc: DeepReadonly<EditableDocument>, address: ItemAddress,
): DeepReadonly<JsonObject> | null {
  if (address.tab === 'card') return doc.kind === 'charx' ? doc.card.data : null;
  if (address.tab === 'module') return doc.kind !== 'lorebook' ? doc.module?.module ?? null : null;
  return collectionFor(doc, address)[address.index] ?? null;
}

export function itemLabel(item: DeepReadonly<JsonObject>, index: number): string {
  for (const key of ['name', 'comment', 'key', 'in']) {
    if (typeof item[key] === 'string' && item[key].trim()) return item[key];
  }
  return `항목 ${index + 1}`;
}

export interface ItemSummary {
  detail: string;
  badges: string[];
}

function preview(value: unknown, length = 80): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, length) : '';
}

/** One-line secondary text and small badges for the item list. */
export function itemSummary(item: DeepReadonly<JsonObject>, target: CollectionTarget): ItemSummary {
  const badges: string[] = [];
  switch (target.tab) {
    case 'lorebook':
      if (target.format === 'risu') {
        if (item.alwaysActive === true) badges.push('상시');
        if (item.selective === true) badges.push('선택적');
        if (item.mode === 'folder') badges.push('폴더');
        return { detail: preview(item.key) || preview(item.content), badges };
      }
      if (item.enabled === false) badges.push('꺼짐');
      if (item.constant === true) badges.push('상시');
      return {
        detail: Array.isArray(item.keys) ? item.keys.join(', ') : preview(item.content),
        badges,
      };
    case 'regex':
      if (item.ableFlag === true && typeof item.flag === 'string' && item.flag) badges.push(item.flag);
      return { detail: preview(item.in), badges };
    case 'trigger':
      return { detail: typeof item.type === 'string' ? item.type : '', badges };
  }
}

export function textLength(value: DeepReadonly<JsonValue> | undefined): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce<number>((sum, entry) => sum + textLength(entry), 0);
  return 0;
}

export function editableCopy(value: DeepReadonly<JsonObject>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export function initialItem(target: CollectionTarget): JsonObject {
  switch (target.tab) {
    case 'lorebook': return target.format === 'risu'
      ? { comment: '새 항목', key: '', secondkey: '', content: '', insertorder: 100,
          mode: 'normal', alwaysActive: false, selective: false }
      : { name: '새 항목', keys: [], content: '', enabled: true, insertion_order: 100 };
    case 'regex': return { comment: '새 정규식', in: '', out: '', type: 'editinput' };
    case 'trigger': return { comment: '새 트리거', type: 'manual', conditions: [], effect: [] };
  }
}

export function fieldText(value: DeepReadonly<JsonValue> | undefined): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value.join('\n');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
}

export function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
