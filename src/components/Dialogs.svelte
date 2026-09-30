<script lang="ts">
  import type { EditorStores, Settings, SnapshotReason } from '$contracts';
  import { perform } from './actions';
  import { flushPendingEdits } from './pendingEdits';
  import { formatSize } from './view';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';

  let { stores, onissues }: { stores: EditorStores; onissues: () => void } = $props();
  let ui = $derived(stores.ui);
  let status = $derived(stores.status);
  let settings = $derived(stores.settings);
  let snapshots = $derived(stores.snapshots);
  let draft = $derived(stores.draft);
  let label = $state('');
  let interval = $state(5);
  let limit = $state(100);
  let theme = $state<Settings['theme']>('system');
  let settingsError = $state('');
  let totalSize = $derived($snapshots.reduce((total, entry) => total + entry.size, 0));
  let limitBytes = $derived($settings.snapshotLimitMB * 1024 * 1024);
  let usage = $derived(Math.min(100, limitBytes ? (totalSize / limitBytes) * 100 : 0));
  // Newest first reads naturally in a history list.
  let history = $derived([...$snapshots].reverse());
  const reasonLabels: Record<SnapshotReason, string> = {
    original: '원본', interval: '자동', manual: '수동', export: '내보낸 버전',
    'before-restore': '복원 전', 'before-bulk': '일괄 편집 전',
  };

  $effect(() => {
    if ($ui.openDialog?.kind === 'settings') {
      interval = $settings.snapshotIntervalMin;
      limit = $settings.snapshotLimitMB;
      theme = $settings.theme;
      settingsError = '';
    }
  });

  function close(): void {
    if ($ui.busy) return;
    if ($ui.openDialog?.kind === 'import-confirm') void perform(() => stores.confirmImport('cancel'));
    else stores.closeDialog();
  }

  function when(time: number): string {
    return new Date(time).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function saveSettings(): Promise<void> {
    if (!flushPendingEdits(stores)) return;
    if (!Number.isFinite(Number(interval)) || Number(interval) < 0 || !Number.isFinite(Number(limit)) || Number(limit) <= 0) {
      settingsError = '간격은 0 이상, 용량 한도는 0보다 큰 숫자로 입력해 주세요.';
      return;
    }
    try {
      await stores.updateSettings({ snapshotIntervalMin: Number(interval), snapshotLimitMB: Number(limit), theme });
      stores.closeDialog();
    } catch { /* status.error contains command failures. */ }
  }
</script>

{#if $ui.openDialog}
  {#key $ui.openDialog.kind}
    {#if $ui.openDialog.kind === 'import-confirm'}
      <Modal title="새 파일 가져오기" onclose={close} initialFocus={$status.dirty ? '[data-export-first]' : '[data-continue]'}>
        <p><strong class="file">{$ui.openDialog.fileName}</strong> 파일을 가져와요.</p>
        <p>새 파일을 가져오면 현재 작업과 스냅샷 {$snapshots.length}개가 모두 삭제돼요.</p>
        {#if $status.dirty}
          <div class="callout danger" role="alert"><Icon name="alert" />
            <strong>내보내지 않은 변경 내용이 있어요. 먼저 내보내서 보관해 주세요.</strong></div>
        {/if}
        {#if $draft}
          <div class="callout"><Icon name="alert" />
            <span>JSON 초안이 있어요. 그냥 계속하면 초안도 삭제돼요. 내보내려면 취소하고 오류를 먼저 고쳐 주세요.</span></div>
        {/if}
        {#snippet actions()}
          <button disabled={!!$ui.busy} onclick={close}>취소</button>
          <button class={$status.dirty ? 'danger' : 'outline'} data-continue disabled={!!$ui.busy}
            onclick={() => perform(() => { if (flushPendingEdits(stores)) return stores.confirmImport('continue'); })}>그냥 계속</button>
          <button class="primary" data-export-first disabled={!!$ui.busy || !!$draft}
            onclick={() => perform(async () => { if (!flushPendingEdits(stores)) return; await stores.confirmImport('export-then-continue'); onissues(); })}>내보내고 계속</button>
        {/snippet}
      </Modal>
    {:else if $ui.openDialog.kind === 'snapshots'}
      <Modal title="스냅샷" onclose={close} wide>
        <div class="usage">
          <div class="usage-row"><span>{formatSize(totalSize)} / {$settings.snapshotLimitMB} MB</span><span class="hint">고정 스냅샷 포함</span></div>
          <div class="meter" class:over={totalSize > limitBytes}><span style:width={`${usage}%`}></span></div>
          {#if totalSize > limitBytes}<p class="hint warn-text">용량 한도를 넘었어요. 고정 스냅샷은 자동으로 삭제하지 않아요.</p>{/if}
        </div>
        <form class="snapshot-form" onsubmit={(event) => { event.preventDefault(); void perform(async () => { if (!flushPendingEdits(stores)) return; await stores.takeManualSnapshot(label || undefined); label = ''; }); }}>
          <label class="sr-only" for="snapshot-label">스냅샷 이름 (선택)</label>
          <input id="snapshot-label" bind:value={label} placeholder="스냅샷 이름 (선택)" disabled={!!$ui.busy || !!$draft} />
          <button class="primary" disabled={!!$ui.busy || !!$draft}><Icon name="plus" size={16} />수동 스냅샷 저장</button>
        </form>
        <ul class="snapshot-list">
          {#each history as entry (entry.id)}
            <li>
              <div class="snap-main">
                <div class="snap-title">
                  <strong>{entry.label || reasonLabels[entry.reason]}</strong>
                  {#if entry.pinned}<span class="badge"><Icon name="pin" size={11} />고정</span>{/if}
                </div>
                <div class="hint"><time datetime={new Date(entry.time).toISOString()}>{when(entry.time)}</time> · {reasonLabels[entry.reason]} · {formatSize(entry.size)}</div>
              </div>
              <div class="snap-actions">
                <button class="small outline" disabled={!!$ui.busy} aria-label={`${entry.label || reasonLabels[entry.reason]} 복원`}
                  onclick={() => { if (flushPendingEdits(stores)) stores.openDialog({ kind: 'restore-confirm', snapshotId: entry.id }); }}>복원</button>
                <button class="icon small danger" disabled={!!$ui.busy} aria-label={`${entry.label || reasonLabels[entry.reason]} 삭제`}
                  onclick={() => perform(() => { if (flushPendingEdits(stores)) return stores.deleteSnapshot(entry.id); })}><Icon name="trash" size={15} /></button>
              </div>
            </li>
          {/each}
        </ul>
        {#if !$snapshots.length}<p class="hint">아직 스냅샷이 없어요.</p>{/if}
      </Modal>
    {:else if $ui.openDialog.kind === 'restore-confirm'}
      {@const id = $ui.openDialog.snapshotId}
      <Modal title="스냅샷 복원" onclose={close} initialFocus="[data-restore-cancel]">
        <p>이 스냅샷으로 복원할까요? 현재 내용은 '복원 전' 스냅샷으로 먼저 저장해요.</p>
        {#if $draft}<div class="callout"><Icon name="alert" /><span>현재 JSON 초안은 삭제돼요.</span></div>{/if}
        {#snippet actions()}
          <button data-restore-cancel disabled={!!$ui.busy} onclick={() => stores.openDialog({ kind: 'snapshots' })}>취소</button>
          <button class="primary" disabled={!!$ui.busy} onclick={() => perform(() => { if (flushPendingEdits(stores)) return stores.restoreSnapshot(id); })}>복원</button>
        {/snippet}
      </Modal>
    {:else if $ui.openDialog.kind === 'settings'}
      <Modal title="설정" onclose={close}>
        <form id="settings-form" class="settings-form" onsubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
          <div class="setting">
            <label for="snapshot-interval">자동 스냅샷 간격</label>
            <select id="snapshot-interval" bind:value={interval} disabled={!!$ui.busy}>
              {#if ![0, 1, 5, 10, 30].includes($settings.snapshotIntervalMin)}<option value={$settings.snapshotIntervalMin}>{$settings.snapshotIntervalMin}분</option>{/if}
              <option value={0}>끔</option><option value={1}>1분</option><option value={5}>5분</option><option value={10}>10분</option><option value={30}>30분</option>
            </select>
            <p class="hint">바뀐 내용이 있을 때만 저장해요.</p>
          </div>
          <div class="setting">
            <label for="snapshot-limit">스냅샷 용량 한도 (MB)</label>
            <input id="snapshot-limit" type="number" min="0.001" step="any" bind:value={limit} disabled={!!$ui.busy} required />
            <p class="hint">넘으면 오래된 자동 스냅샷부터 지워요. 원본·수동·내보낸 버전은 남겨요.</p>
          </div>
          <div class="setting">
            <label for="theme">테마</label>
            <select id="theme" bind:value={theme} disabled={!!$ui.busy}><option value="system">시스템 설정</option><option value="light">밝게</option><option value="dark">어둡게</option></select>
          </div>
          {#if settingsError}<div class="callout danger" role="alert"><Icon name="alert" /><span>{settingsError}</span></div>{/if}
        </form>
        {#snippet actions()}
          <button type="button" disabled={!!$ui.busy} onclick={close}>취소</button>
          <button class="primary" type="submit" form="settings-form" disabled={!!$ui.busy}>저장</button>
        {/snippet}
      </Modal>
    {/if}
  {/key}
{/if}

<style>
  .file { color: var(--text); overflow-wrap: anywhere; }
  .callout {
    display: flex; gap: .6rem; align-items: flex-start; padding: .7rem .85rem; margin-top: .4rem;
    border-radius: var(--radius); color: var(--warning); background: var(--warning-soft); font-size: .9rem;
  }
  .callout.danger { color: var(--danger); background: var(--danger-soft); }
  .callout span, .callout strong { color: inherit; line-height: 1.55; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .usage { display: grid; gap: .4rem; margin-bottom: 1rem; }
  .usage-row { display: flex; justify-content: space-between; font-size: .85rem; color: var(--text); font-variant-numeric: tabular-nums; }
  .meter { height: .4rem; border-radius: 999px; background: var(--sunken); overflow: hidden; }
  .meter span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
  .meter.over span { background: var(--warning); }
  .warn-text { color: var(--warning); margin: 0; }

  .snapshot-form { display: flex; gap: .5rem; margin-bottom: .75rem; }
  .snapshot-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .snapshot-list:empty { display: none; }
  .snapshot-list li { display: flex; align-items: center; gap: .75rem; padding: .7rem .85rem; background: var(--surface); }
  .snapshot-list li + li { border-top: 1px solid var(--border); }
  .snap-main { flex: 1; min-width: 0; display: grid; gap: .15rem; }
  .snap-title { display: flex; align-items: center; gap: .45rem; min-width: 0; }
  .snap-title strong { color: var(--text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .snap-title .badge { gap: .2rem; }
  .snap-actions { display: flex; gap: .25rem; flex-shrink: 0; }

  .settings-form { display: grid; gap: 1.1rem; }
  .setting { display: grid; gap: .35rem; }
  .setting label { font-size: .85rem; font-weight: 600; color: var(--text); }
  .setting .hint { margin: 0; }
  @media (max-width: 767px) { .snapshot-form { flex-direction: column; } }
</style>
