<script lang="ts" module>
  export interface ListEntry {
    key: string;
    label: string;
    index: number | null;
    detail?: string;
    badges?: readonly string[];
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  let { entries, selectedKey, disabled, canEditList, onselect, onadd }: {
    entries: readonly ListEntry[]; selectedKey: string | null; disabled: boolean; canEditList: boolean;
    onselect: (entry: ListEntry) => void; onadd: () => void;
  } = $props();
  let query = $state('');
  let filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase('ko');
    if (!needle) return entries;
    return entries.filter((entry) =>
      `${entry.label}\n${entry.detail ?? ''}`.toLocaleLowerCase('ko').includes(needle));
  });
</script>

<aside class="item-list" aria-label="항목 목록">
  <div class="list-head">
    <label class="search">
      <Icon name="search" size={16} />
      <input type="search" bind:value={query} placeholder="이름·키워드로 찾기" aria-label="이름 검색" />
    </label>
    {#if canEditList}
      <div class="list-meta">
        <span class="hint">{query.trim() ? `${filtered.length} / ${entries.length}개` : `${entries.length}개 항목`}</span>
        <button class="small outline" {disabled} onclick={onadd}><Icon name="plus" size={15} />추가</button>
      </div>
    {/if}
  </div>
  <ul>
    {#each filtered as entry (entry.key)}
      <li>
        <button class="entry" class:selected={selectedKey === entry.key} aria-pressed={selectedKey === entry.key}
          aria-label={entry.label} {disabled} onclick={() => onselect(entry)}>
          <span class="entry-title">{entry.label}</span>
          {#if entry.detail || entry.badges?.length}
            <span class="entry-sub">
              {#each entry.badges ?? [] as badge}<span class="badge neutral">{badge}</span>{/each}
              {#if entry.detail}<span class="entry-detail">{entry.detail}</span>{/if}
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
  {#if filtered.length === 0}
    <p class="empty hint">{entries.length ? '검색 결과가 없어요.' : '아직 항목이 없어요. 추가해 주세요.'}</p>
  {/if}
</aside>

<style>
  .item-list {
    display: flex; flex-direction: column; min-width: 0; min-height: 0;
    background: var(--surface); border-right: 1px solid var(--border);
  }
  .list-head { padding: .85rem .85rem .6rem; display: grid; gap: .6rem; border-bottom: 1px solid var(--border); }
  .search { position: relative; display: block; color: var(--muted); }
  .search :global(.icon) { position: absolute; left: .65rem; top: 50%; transform: translateY(-50%); pointer-events: none; }
  .search input { padding-left: 2.1rem !important; background: var(--sunken) !important; border-color: transparent !important; }
  .search input:focus { background: var(--surface) !important; border-color: var(--accent) !important; }
  .list-meta { display: flex; align-items: center; justify-content: space-between; }
  ul { list-style: none; margin: 0; padding: .4rem; overflow: auto; flex: 1; display: grid; align-content: start; gap: 1px; }
  .entry {
    width: 100%; height: auto !important; padding: .55rem .7rem !important;
    display: grid !important; justify-content: stretch; justify-items: start; gap: .2rem; text-align: left;
    border-radius: var(--radius-sm); position: relative;
  }
  .entry.selected { background: var(--accent-soft) !important; }
  .entry.selected::before {
    content: ''; position: absolute; left: 0; top: .5rem; bottom: .5rem; width: 3px;
    border-radius: 3px; background: var(--accent);
  }
  .entry-title {
    color: var(--text); font-weight: 500; max-width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .entry.selected .entry-title { color: var(--accent); font-weight: 600; }
  .entry-sub { display: flex; align-items: center; gap: .3rem; max-width: 100%; min-width: 0; }
  .entry-detail {
    color: var(--muted); font-size: .8rem; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .empty { padding: 1.5rem 1rem; text-align: center; }
  @media (max-width: 767px) {
    .item-list { border-right: 0; border-bottom: 1px solid var(--border); max-height: 16rem; }
  }
</style>
