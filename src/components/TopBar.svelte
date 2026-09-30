<script lang="ts">
  import type { EditorStores } from '$contracts';
  import { flushPendingEdits } from './pendingEdits';
  import Icon from './Icon.svelte';
  let { stores, onimport, onexport }: {
    stores: EditorStores; onimport: () => void; onexport: () => void;
  } = $props();
  let workspace = $derived(stores.workspace);
  let status = $derived(stores.status);
  let ui = $derived(stores.ui);
  let draft = $derived(stores.draft);
  const kindLabels = { charx: 'CHARX', risum: 'RISUM', lorebook: 'LOREBOOK' } as const;
</script>

<header class="topbar">
  <div class="brand"><Icon name="moon" size={18} /><span>Solene</span></div>
  {#if $workspace.record}
    <div class="file-chip" title={$workspace.record.fileName}>
      <Icon name="file" size={16} />
      <span class="filename">{$workspace.record.fileName}</span>
      <span class="badge neutral">{kindLabels[$workspace.record.kind]}</span>
      {#if $status.dirty}<span class="dirty" title="내보내지 않은 변경이 있어요"><i></i>미저장</span>{/if}
    </div>
  {/if}
  <div class="actions">
    <button disabled={!$workspace.record || !!$ui.busy}
      onclick={() => { if (flushPendingEdits(stores)) stores.openDialog({ kind: 'snapshots' }); }}>
      <Icon name="history" /><span class="label">스냅샷</span>
    </button>
    <button class="icon" aria-label="설정" title="설정" disabled={!!$ui.busy}
      onclick={() => { if (flushPendingEdits(stores)) stores.openDialog({ kind: 'settings' }); }}>
      <Icon name="settings" />
    </button>
    <span class="divider" aria-hidden="true"></span>
    <button class="outline" disabled={!!$ui.busy} onclick={() => { if (flushPendingEdits(stores)) onimport(); }}>
      <Icon name="import" /><span class="label">가져오기</span>
    </button>
    <button class="primary" disabled={!$workspace.record || !!$ui.busy || !!$draft}
      onclick={() => { if (flushPendingEdits(stores)) onexport(); }}>
      <Icon name="export" /><span class="label">내보내기</span>
    </button>
  </div>
</header>

<style>
  .topbar {
    display: flex; align-items: center; gap: 1rem;
    height: 3.5rem; padding: 0 1rem 0 1.25rem;
    background: var(--surface); border-bottom: 1px solid var(--border);
  }
  .brand { display: flex; align-items: center; gap: .45rem; color: var(--accent); font-weight: 700; letter-spacing: -.01em; font-size: 1.02rem; }
  .brand span { color: var(--text); }
  .file-chip {
    display: flex; align-items: center; gap: .5rem; min-width: 0;
    height: 2.1rem; padding: 0 .75rem; border-radius: var(--radius-sm);
    background: var(--sunken); color: var(--muted);
  }
  .filename { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 28rem; }
  .dirty { display: inline-flex; align-items: center; gap: .35rem; color: var(--warning); font-size: .8rem; font-weight: 600; white-space: nowrap; }
  .dirty i { width: .45rem; height: .45rem; border-radius: 50%; background: currentColor; }
  .actions { display: flex; align-items: center; gap: .35rem; margin-left: auto; }
  .divider { width: 1px; height: 1.25rem; background: var(--border); margin: 0 .25rem; }
  @media (max-width: 767px) {
    .topbar { height: auto; flex-wrap: wrap; padding: .6rem .75rem; gap: .5rem; }
    .file-chip { order: 3; flex-basis: 100%; }
    .actions .label { display: none; }
    .actions button:not(.icon) { width: 2.1rem; padding: 0; }
  }
</style>
