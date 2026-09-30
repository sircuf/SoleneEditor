<script lang="ts">
  import type { DeepReadonly, EditorStores, ItemAddress, JsonObject, JsonValue } from '$contracts';
  import { isWide, type FieldDefinition } from '../schemas/fields';
  import { get } from 'svelte/store';
  import { editableCopy, itemFor } from './view';
  import FieldInput from './FieldInput.svelte';

  let { stores, address, item, fields, allFields, disabled }: {
    stores: EditorStores; address: ItemAddress; item: DeepReadonly<JsonObject>;
    fields: readonly FieldDefinition[]; allFields: readonly FieldDefinition[]; disabled: boolean;
  } = $props();
  let extraCount = $derived(Object.keys(item).filter((key) => !allFields.some((field) => field.key === key)).length);

  function compatible(field: FieldDefinition): boolean {
    const value = item[field.key];
    if (value === undefined) return true;
    switch (field.kind) {
      case 'boolean': return typeof value === 'boolean';
      case 'number': return typeof value === 'number';
      case 'string-list':
      case 'multiline-list': return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
      default: return typeof value === 'string';
    }
  }

  function update(field: FieldDefinition, value: JsonValue): void {
    if (address.tab === 'card') stores.setCardField(field.key, value);
    else {
      // Multiple fields can flush in one event, before Svelte updates props.
      // Merge into the latest store item so no sibling commit is overwritten.
      const record = get(stores.workspace).record;
      const current = record ? itemFor(record.doc, address) : null;
      if (current) stores.updateItem(address, { ...editableCopy(current), [field.key]: value });
    }
  }
</script>

<form class="form-view" onsubmit={(event) => event.preventDefault()}>
  {#each fields as field (field.key)}
    <div class="field" class:wide={isWide(field) || address.tab === 'card'} class:toggle={field.kind === 'boolean'}>
      {#if !compatible(field)}
        <span class="label">{field.label}</span>
        <p class="incompatible hint">이 값은 폼에서 다룰 수 없는 자료형이에요. JSON에서 편집해 주세요.</p>
      {:else}
        <FieldInput {stores} {field} value={item[field.key]} {disabled} oncommit={(value) => update(field, value)} />
      {/if}
      {#if field.help}<small class="hint">{field.help}</small>{/if}
    </div>
  {/each}
  {#if address.tab === 'trigger'}<p class="note hint">조건(conditions)과 효과(effect)는 JSON에서 편집해요.</p>{/if}
  {#if extraCount}<p class="note hint">기타 필드 {extraCount}개 (JSON에서 편집)</p>{/if}
</form>

<style>
  .form-view { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem 1.25rem; align-items: start; }
  .field { display: grid; gap: .4rem; min-width: 0; }
  .field.wide, .note { grid-column: 1 / -1; }
  .field.toggle { align-self: center; }
  .label { font-size: .8rem; font-weight: 600; color: var(--text-soft); }
  .incompatible { margin: 0; padding: .55rem .7rem; background: var(--sunken); border-radius: var(--radius-sm); }
  .note { margin: .25rem 0 0; }
  @media (max-width: 767px) { .form-view { grid-template-columns: minmax(0, 1fr); } }
</style>
