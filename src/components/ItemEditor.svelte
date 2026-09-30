<script lang="ts">
  import type { DeepReadonly, EditorStores, ItemAddress, JsonObject } from '$contracts';
  import { fieldsFor, tabLabels } from '../schemas/fields';
  import { perform } from './actions';
  import { flushPendingEdits } from './pendingEdits';
  import FormView from './FormView.svelte';
  import JsonView from './JsonView.svelte';
  import Icon from './Icon.svelte';

  let { stores, address, item, cardField, title, ondelete }: {
    stores: EditorStores; address: ItemAddress | null; item: DeepReadonly<JsonObject> | null;
    cardField: string; title: string; ondelete: () => void;
  } = $props();
  let ui = $derived(stores.ui);
  let draft = $derived(stores.draft);
  let allFields = $derived(address ? fieldsFor(address) : []);
  let fields = $derived(address?.tab === 'card' ? allFields.filter((field) => field.key === cardField) : allFields);
  let jsonIdentity = $derived(`${JSON.stringify(address)}:${$ui.busy ?? 'ready'}`);
  let text = $derived($draft?.text ?? JSON.stringify(item, null, 2));
  let eyebrow = $derived(address ? `${tabLabels[address.tab]}${'index' in address ? ` · ${address.index + 1}번째` : ''}` : '');
</script>

<section class="item-editor" aria-label="항목 편집기">
  {#if address && item}
    <header class="editor-head">
      <div class="heading">
        <span class="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div class="head-actions">
        <div class="segmented" role="group" aria-label="편집 모드">
          <button aria-pressed={$ui.editorMode === 'form'} aria-label="폼" disabled={!!$draft || !!$ui.busy}
            onclick={() => perform(() => { if (flushPendingEdits(stores)) return stores.setEditorMode('form'); })}>
            <Icon name="form" size={16} />폼
          </button>
          <button aria-pressed={$ui.editorMode === 'json'} aria-label="JSON" disabled={!!$ui.busy}
            onclick={() => perform(() => { if (flushPendingEdits(stores)) return stores.setEditorMode('json'); })}>
            <Icon name="code" size={16} />JSON
          </button>
        </div>
        {#if 'index' in address}
          <button class="icon danger" aria-label="삭제" title="항목 삭제" disabled={!!$ui.busy || !!$draft} onclick={ondelete}>
            <Icon name="trash" />
          </button>
        {/if}
      </div>
    </header>
    <div class="editor-body">
      {#if $draft}
        <div class="draft-warning" role="status">
          <Icon name="alert" />
          <p>JSON 오류를 고쳐야 폼 전환, 항목 이동, 내보내기를 할 수 있어요.</p>
          <button class="small outline" disabled={!!$ui.busy}
            onclick={() => perform(() => { if (flushPendingEdits(stores)) return stores.discardDraft(); })}>JSON 초안 버리기</button>
        </div>
      {/if}
      {#if $ui.editorMode === 'json'}
        {#if address.tab === 'card'}<p class="hint">카드의 data 전체를 편집해요.</p>{/if}
        {#key jsonIdentity}<JsonView {stores} {address} {text} disabled={!!$ui.busy} />{/key}
      {:else}
        {#key JSON.stringify(address)}<FormView {stores} {address} {item} {fields} {allFields} disabled={!!$ui.busy || !!$draft} />{/key}
      {/if}
    </div>
  {:else}
    <div class="placeholder">
      <p>편집할 항목을 선택하거나 새로 추가해 주세요.</p>
    </div>
  {/if}
</section>

<style>
  .item-editor { min-width: 0; min-height: 0; overflow: auto; background: var(--bg); }
  .editor-head {
    position: sticky; top: 0; z-index: 2;
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: .9rem 2rem; background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--border);
  }
  .heading { min-width: 0; display: grid; gap: .1rem; }
  .eyebrow { font-size: .75rem; font-weight: 600; color: var(--muted); letter-spacing: .02em; }
  h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: -.015em; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
  .segmented { display: flex; padding: 3px; gap: 2px; background: var(--sunken); border-radius: calc(var(--radius-sm) + 3px); }
  .segmented button { height: 1.85rem; padding: 0 .7rem; font-size: .85rem; color: var(--muted); }
  .segmented button[aria-pressed='true'] { background: var(--raised); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
  .editor-body { max-width: 56rem; margin: 0 auto; padding: 1.5rem 2rem 4rem; display: grid; gap: 1rem; }
  .draft-warning {
    display: flex; align-items: center; gap: .75rem; padding: .7rem .9rem;
    color: var(--warning); background: var(--warning-soft); border-radius: var(--radius);
  }
  .draft-warning p { margin: 0; flex: 1; color: var(--text-soft); font-size: .9rem; }
  .placeholder { display: grid; place-items: center; height: 100%; min-height: 16rem; color: var(--muted); }
  @media (max-width: 767px) {
    .editor-head { padding: .75rem 1rem; }
    .editor-body { padding: 1rem 1rem 3rem; }
  }
</style>
