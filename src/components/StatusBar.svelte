<script lang="ts">
  import { onMount } from 'svelte';
  import type { EditorStores } from '$contracts';
  let { stores }: { stores: EditorStores } = $props();
  let workspace = $derived(stores.workspace);
  let status = $derived(stores.status);
  let snapshots = $derived(stores.snapshots);
  let settings = $derived(stores.settings);
  let now = $state(Date.now());

  onMount(() => {
    const timer = setInterval(() => { now = Date.now(); }, 15_000);
    return () => clearInterval(timer);
  });

  function relative(time: number): string {
    const seconds = Math.max(0, Math.round((now - time) / 1000));
    if (seconds < 20) return '방금 전';
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    return new Date(time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  let exported = $derived($workspace.record?.lastExportedAt ?? null);
</script>

<footer class="statusbar">
  <span class="item">
    <i class="dot" class:saved={!!$status.lastSavedAt}></i>
    {$status.lastSavedAt ? `브라우저에 자동 저장됨 · ${relative($status.lastSavedAt)}` : '아직 저장 전이에요'}
  </span>
  <span class="item">{exported ? `마지막 내보내기 · ${relative(exported)}` : '아직 내보낸 적 없어요'}</span>
  <span class="spacer"></span>
  <span class="item">스냅샷 {$snapshots.length}개</span>
  <span class="item">자동 스냅샷 {$settings.snapshotIntervalMin ? `${$settings.snapshotIntervalMin}분마다` : '꺼짐'}</span>
</footer>

<style>
  .statusbar {
    display: flex; align-items: center; gap: 1.25rem; height: 1.9rem; padding: 0 1.25rem;
    font-size: .75rem; color: var(--muted); background: var(--surface); border-top: 1px solid var(--border);
    white-space: nowrap; overflow: hidden;
  }
  .item { display: inline-flex; align-items: center; gap: .4rem; }
  .spacer { flex: 1; }
  .dot { width: .4rem; height: .4rem; border-radius: 50%; background: var(--faint); }
  .dot.saved { background: var(--success); }
  @media (max-width: 767px) { .statusbar .item:nth-child(n + 2) { display: none; } }
</style>
