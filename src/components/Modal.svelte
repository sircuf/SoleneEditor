<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, onclose, children, actions, initialFocus, wide = false }: {
    title: string; onclose: () => void; children: Snippet; actions?: Snippet; initialFocus?: string; wide?: boolean;
  } = $props();
  let element: HTMLDialogElement;
  onMount(() => {
    const previousFocus = document.activeElement;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    if (initialFocus) element.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      element.close?.();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  });
</script>

<dialog bind:this={element} class:wide aria-label={title} oncancel={(event) => { event.preventDefault(); onclose(); }}>
  <header class="dialog-head">
    <h2>{title}</h2>
    <button class="icon" aria-label="닫기" onclick={onclose}><Icon name="close" /></button>
  </header>
  <div class="dialog-body">{@render children()}</div>
  {#if actions}<footer class="dialog-actions">{@render actions()}</footer>{/if}
</dialog>

<style>
  dialog {
    color: var(--text); background: var(--raised); border: 1px solid var(--border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
    padding: 0; width: min(30rem, calc(100vw - 2rem)); max-height: calc(100dvh - 3rem);
    display: flex; flex-direction: column; overflow: hidden;
  }
  dialog:not([open]) { display: none; }
  dialog.wide { width: min(40rem, calc(100vw - 2rem)); }
  dialog::backdrop { background: rgb(20 16 30 / .45); backdrop-filter: blur(3px); }
  dialog[open] { animation: rise .18s var(--ease); }
  @keyframes rise { from { opacity: 0; transform: translateY(6px) scale(.985); } }
  .dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1rem .25rem 1.4rem; }
  h2 { font-size: 1.08rem; font-weight: 700; letter-spacing: -.01em; margin: 0; }
  .dialog-body { padding: .5rem 1.4rem 1.25rem; overflow: auto; line-height: 1.6; color: var(--text-soft); }
  .dialog-body :global(p) { margin: 0 0 .6rem; }
  .dialog-actions {
    display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem;
    padding: .85rem 1.4rem; background: var(--surface); border-top: 1px solid var(--border);
  }
  @media (prefers-reduced-motion: reduce) { dialog[open] { animation: none; } }
</style>
