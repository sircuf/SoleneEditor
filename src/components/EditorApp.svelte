<script lang="ts">
  import './theme.css';
  import type { DeepReadonly, EditorStores, ItemAddress, ItemValue, JsonObject, ValidationIssue } from '$contracts';
  import { cardFields, tabLabels } from '../schemas/fields';
  import { perform } from './actions';
  import { get } from 'svelte/store';
  import { flushPendingEdits, hasPendingEdits } from './pendingEdits';
  import { collectionFor, initialItem, itemFor, itemLabel, itemSummary, targetFor, textLength } from './view';
  import TopBar from './TopBar.svelte';
  import Tabs from './Tabs.svelte';
  import ItemList from './ItemList.svelte';
  import type { ListEntry } from './ItemList.svelte';
  import ItemEditor from './ItemEditor.svelte';
  import StatusBar from './StatusBar.svelte';
  import Dialogs from './Dialogs.svelte';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';

  let { stores }: { stores: EditorStores } = $props();
  let workspace = $derived(stores.workspace);
  let ui = $derived(stores.ui);
  let status = $derived(stores.status);
  let settings = $derived(stores.settings);
  let draft = $derived(stores.draft);
  let fileInput: HTMLInputElement;
  let cardField = $state('name');
  let deleteAddress = $state<ItemAddress | null>(null);
  let exportIssues = $state<readonly ValidationIssue[]>([]);
  let exportResult = $state<'invalid' | 'exported' | null>(null);
  let dragging = $state(false);
  let target = $derived($ui.activeTab ? targetFor($ui.activeTab, $workspace) : null);
  let address: ItemAddress | null = $derived($ui.activeTab === 'card' || $ui.activeTab === 'module'
    ? { tab: $ui.activeTab } : target && $ui.selectedIndex !== null ? { ...target, index: $ui.selectedIndex } : null);
  let item: DeepReadonly<JsonObject> | null = $derived($workspace.record && address ? itemFor($workspace.record.doc, address) : null);
  let entries: ListEntry[] = $derived.by(() => {
    const record = $workspace.record;
    if (!record || !$ui.activeTab) return [];
    if ($ui.activeTab === 'card') {
      const data = record.doc.kind === 'charx' ? record.doc.card.data : null;
      return cardFields.map((field) => {
        const length = textLength(data?.[field.key]);
        return { key: field.key, label: field.label, index: null, detail: length ? `${length.toLocaleString('ko-KR')}자` : '비어 있음' };
      });
    }
    if ($ui.activeTab === 'module') return [{ key: 'module', label: '모듈 정보', index: null }];
    if (!target) return [];
    const listTarget = target;
    return collectionFor(record.doc, listTarget).map((entry, index) => ({
      key: String(index), label: itemLabel(entry, index), index, ...itemSummary(entry, listTarget),
    }));
  });
  let selectedKey = $derived($ui.activeTab === 'card' ? cardField : $ui.activeTab === 'module' ? 'module'
    : $ui.selectedIndex === null ? null : String($ui.selectedIndex));
  let title = $derived($ui.activeTab === 'card' ? cardFields.find((field) => field.key === cardField)?.label ?? '카드'
    : item && $ui.selectedIndex !== null ? itemLabel(item, $ui.selectedIndex) : $ui.activeTab ? tabLabels[$ui.activeTab] : '편집기');

  function select(entry: ListEntry): void {
    if ($ui.busy || !$ui.activeTab || !flushPendingEdits(stores) || get(stores.draft)) return;
    if ($ui.activeTab === 'card') cardField = entry.key;
    else stores.select($ui.activeTab, entry.index);
  }

  function add(): void {
    if (!target || !flushPendingEdits(stores)) return;
    const collectionTarget = target;
    void perform(() => stores.addItem(collectionTarget, initialItem(collectionTarget) as ItemValue<typeof collectionTarget>));
  }

  function requestDelete(): void {
    if (flushPendingEdits(stores) && !get(stores.draft)) deleteAddress = address;
  }

  function requestImport(file?: File): void {
    if (!file || $ui.busy || !flushPendingEdits(stores)) return;
    exportIssues = [];
    exportResult = null;
    void perform(() => stores.requestImport(file));
  }

  async function exportFile(): Promise<void> {
    if (!flushPendingEdits(stores)) return;
    await perform(async () => {
      const result = await stores.exportFile();
      exportIssues = result.issues;
      exportResult = result.status;
    });
  }

  function showImportIssues(): void {
    exportIssues = $status.error?.issues ?? [];
    exportResult = exportIssues.some((issue) => issue.severity === 'error') ? 'invalid' : null;
  }

  function drop(event: DragEvent): void {
    event.preventDefault(); event.stopPropagation(); dragging = false;
    requestImport(event.dataTransfer?.files[0]);
  }

  function beforeUnload(event: BeforeUnloadEvent): void {
    const pending = hasPendingEdits(stores);
    flushPendingEdits(stores);
    if (!$status.dirty && !$draft && !pending) return;
    event.preventDefault(); event.returnValue = '';
  }
</script>

<svelte:window onbeforeunload={beforeUnload} ondragover={(event) => event.preventDefault()} ondrop={drop} />

<div class="solene editor-app" data-theme={$settings.theme}>
  <input class="file-input" bind:this={fileInput} type="file" aria-label="가져올 파일" accept=".charx,.jpg,.jpeg,.risum,.json"
    onchange={(event) => { requestImport(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
  <TopBar {stores} onimport={() => fileInput.click()} onexport={() => void exportFile()} />
  {#if $workspace.record}
    <Tabs {stores} />
    <main class="panes" aria-busy={!!$ui.busy}>
      {#key $ui.activeTab}
        <ItemList {entries} {selectedKey} disabled={!!$draft || !!$ui.busy} canEditList={!!target}
          onselect={select} onadd={add} />
      {/key}
      <ItemEditor {stores} {address} {item} {cardField} {title} ondelete={requestDelete} />
    </main>
    <StatusBar {stores} />
  {:else}
    <main class="empty-state">
      <div class="hero">
        <div class="mark" aria-hidden="true"><Icon name="moon" size={30} /></div>
        <h1>RisuAI 파일을 텍스트로 편집해요</h1>
        <p class="hint">캐릭터 카드, 모듈, 로어북을 불러와서 폼이나 JSON으로 고치고 다시 내보내요.</p>
      </div>
      <button class="dropzone" class:dragging disabled={!!$ui.busy} onclick={() => fileInput.click()}
        aria-label="편집할 파일을 가져와 주세요"
        ondragover={(event) => { event.preventDefault(); dragging = true; }} ondragleave={() => { dragging = false; }} ondrop={drop}>
        <Icon name="import" size={26} />
        <strong>편집할 파일을 가져와 주세요</strong>
        <span>클릭하거나 파일을 여기에 놓아요</span>
        <span class="formats">
          <span class="badge neutral">.charx</span><span class="badge neutral">.jpg</span>
          <span class="badge neutral">.risum</span><span class="badge neutral">.json</span>
        </span>
      </button>
      <p class="privacy hint">파일은 서버로 보내지 않고 이 브라우저 안에서만 처리해요.</p>
    </main>
  {/if}

  <div class="toasts">
    {#if exportResult}
      <section class="toast" class:invalid={exportResult === 'invalid'} aria-label="내보내기 결과" role="status">
        <div class="toast-head">
          <Icon name={exportResult === 'invalid' ? 'alert' : 'check'} />
          <strong>{exportResult === 'invalid' ? '오류를 고쳐야 내보낼 수 있어요.' : '다운로드를 시작했어요.'}</strong>
          <button class="icon small" aria-label="결과 닫기" onclick={() => { exportResult = null; exportIssues = []; }}><Icon name="close" size={16} /></button>
        </div>
        {#if exportIssues.length}
          <ul class="issues">{#each exportIssues as issue}
            <li class:error={issue.severity === 'error'}><span class="badge" class:warn={issue.severity !== 'error'}>{issue.severity === 'error' ? '오류' : '경고'}</span>
              <code>{issue.path || '/'}</code> {issue.message}</li>
          {/each}</ul>
        {/if}
      </section>
    {/if}
    {#if $status.error}
      <div class="toast invalid" role="alert">
        <div class="toast-head">
          <Icon name="alert" />
          <span class="message">{$status.error.message}</span>
          <button class="icon small" aria-label="오류 닫기" onclick={() => stores.clearError()}><Icon name="close" size={16} /></button>
        </div>
        {#if $status.error.issues?.length}
          <ul class="issues">{#each $status.error.issues as issue}
            <li><span class="badge" class:warn={issue.severity !== 'error'}>{issue.severity === 'error' ? '오류' : '경고'}</span>
              <code>{issue.path || '/'}</code> {issue.message}</li>
          {/each}</ul>
        {/if}
      </div>
    {/if}
  </div>

  {#if $ui.busy}
    <div class="busy" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {$ui.busy === 'import' ? '파일을 가져오고 있어요' : $ui.busy === 'export' ? '내보내고 있어요' : '스냅샷을 복원하고 있어요'}
    </div>
  {/if}
  <Dialogs {stores} onissues={showImportIssues} />
  {#if deleteAddress && 'index' in deleteAddress}
    {@const deleting = deleteAddress}
    <Modal title="항목 삭제" onclose={() => { deleteAddress = null; }} initialFocus="[data-delete-cancel]">
      <p>선택한 항목을 삭제할까요? 나중에 되돌리고 싶다면 먼저 스냅샷을 저장해 두세요.</p>
      {#snippet actions()}
        <button data-delete-cancel onclick={() => { deleteAddress = null; }}>취소</button>
        <button class="danger solid" disabled={!!$ui.busy || !!$draft}
          onclick={() => perform(() => { if (!flushPendingEdits(stores)) return; stores.removeItem(deleting); deleteAddress = null; })}>삭제</button>
      {/snippet}
    </Modal>
  {/if}
</div>

<style>
  .editor-app { height: 100dvh; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; }
  .editor-app:has(.empty-state) { grid-template-rows: auto minmax(0, 1fr); }
  .file-input { display: none; }
  .panes { display: grid; grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr); min-height: 0; }

  .empty-state { display: grid; place-content: center; justify-items: center; gap: 1.5rem; padding: 2rem 1rem; overflow: auto; }
  .hero { display: grid; justify-items: center; gap: .5rem; text-align: center; }
  .mark { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; border-radius: 1rem; color: var(--accent); background: var(--accent-soft); }
  .hero h1 { margin: .5rem 0 0; font-size: 1.45rem; letter-spacing: -.02em; }
  .hero p { margin: 0; max-width: 28rem; font-size: .92rem; }
  .dropzone {
    width: min(100%, 34rem); height: auto !important; padding: 2.5rem 1.5rem !important;
    display: grid !important; justify-items: center; gap: .55rem;
    color: var(--text-soft) !important; background: var(--surface) !important;
    border: 1.5px dashed var(--border-strong) !important; border-radius: var(--radius-lg) !important;
  }
  .dropzone:hover:not(:disabled), .dropzone.dragging { border-color: var(--accent) !important; background: var(--accent-soft) !important; color: var(--accent) !important; }
  .dropzone strong { font-size: 1.02rem; color: var(--text); }
  .dropzone span { font-size: .85rem; color: var(--muted); }
  .formats { display: flex; gap: .35rem; margin-top: .35rem; }
  .privacy { margin: 0; }

  .toasts { position: fixed; right: 1.25rem; bottom: 2.75rem; z-index: 20; display: grid; gap: .6rem; width: min(26rem, calc(100vw - 2rem)); }
  .toast {
    background: var(--raised); border: 1px solid var(--border); border-left: 3px solid var(--success);
    border-radius: var(--radius); box-shadow: var(--shadow-lg); padding: .75rem .9rem; overflow-wrap: anywhere;
  }
  .toast.invalid { border-left-color: var(--danger); }
  .toast-head { display: flex; align-items: center; gap: .6rem; }
  .toast-head :global(.icon) { color: var(--success); }
  .toast.invalid .toast-head > :global(.icon) { color: var(--danger); }
  .toast-head strong, .toast-head .message { flex: 1; font-size: .9rem; }
  .issues { list-style: none; margin: .6rem 0 0; padding: 0; display: grid; gap: .35rem; max-height: 14rem; overflow: auto; font-size: .82rem; color: var(--text-soft); }
  .issues li { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; }
  .issues .badge:not(.warn) { color: var(--danger); background: var(--danger-soft); }
  .issues code { font-family: var(--font-mono); font-size: .78rem; color: var(--muted); }

  .busy {
    position: fixed; left: 50%; top: 4.25rem; transform: translateX(-50%); z-index: 30;
    display: flex; align-items: center; gap: .6rem; padding: .5rem 1rem; font-size: .88rem;
    background: var(--raised); border: 1px solid var(--border); border-radius: 999px; box-shadow: var(--shadow);
  }
  .spinner { width: .9rem; height: .9rem; border-radius: 50%; border: 2px solid var(--accent-soft); border-top-color: var(--accent); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 767px) {
    .editor-app { height: auto; min-height: 100dvh; overflow: visible; }
    .panes { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; align-content: start; }
    .toasts { right: 1rem; bottom: 1rem; }
  }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
</style>
