<script lang="ts">
  import type { EditorStores, TabId } from '$contracts';
  import { tabLabels } from '../schemas/fields';
  import { flushPendingEdits } from './pendingEdits';
  import { collectionFor, targetFor } from './view';
  let { stores }: { stores: EditorStores } = $props();
  let workspace = $derived(stores.workspace);
  let ui = $derived(stores.ui);
  let draft = $derived(stores.draft);

  function count(tab: TabId): number | null {
    const record = $workspace.record;
    const target = targetFor(tab, $workspace);
    return record && target ? collectionFor(record.doc, target).length : null;
  }
</script>

<nav class="tabs" aria-label="편집할 영역">
  {#each $workspace.tabs as tab}
    {@const total = count(tab)}
    <button aria-current={$ui.activeTab === tab ? 'page' : undefined} aria-label={tabLabels[tab]}
      disabled={!!$draft || !!$ui.busy} onclick={() => { if (flushPendingEdits(stores)) stores.select(tab); }}>
      {tabLabels[tab]}{#if total !== null}<span class="count">{total}</span>{/if}
    </button>
  {/each}
</nav>

<style>
  .tabs {
    display: flex; gap: .25rem; padding: 0 1rem; overflow-x: auto; overflow-y: hidden; scrollbar-width: none;
    background: var(--surface); border-bottom: 1px solid var(--border);
  }
  .tabs button {
    position: relative; height: 2.75rem; padding: 0 .85rem; border-radius: 0;
    color: var(--muted); font-weight: 500;
  }
  .tabs button:hover:not(:disabled) { background: transparent; color: var(--text); }
  .tabs button[aria-current='page'] { color: var(--text); font-weight: 600; }
  .tabs button[aria-current='page']::after {
    content: ''; position: absolute; left: .6rem; right: .6rem; bottom: 0;
    height: 2px; border-radius: 2px; background: var(--accent);
  }
  .count {
    font-size: .72rem; font-weight: 600; min-width: 1.35rem; height: 1.2rem; padding: 0 .35rem;
    display: inline-grid; place-items: center; border-radius: 999px;
    background: var(--sunken); color: var(--muted);
  }
  .tabs button[aria-current='page'] .count { background: var(--accent-soft); color: var(--accent); }
</style>
