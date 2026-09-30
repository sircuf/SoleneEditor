<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { json } from '@codemirror/lang-json';
  import type { EditorStores, ItemAddress } from '$contracts';
  import { createPendingEdit, registerPendingEdit } from './pendingEdits';

  let { stores, address, text, disabled }: {
    stores: EditorStores; address: ItemAddress; text: string; disabled: boolean;
  } = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let editorText = $state<string | null>(null);
  let submittedText: string | null = null;
  const expectedEchoes = new Set<string>();
  let syncing = false;
  let composing = false;
  let flushAfterComposition = false;
  const edit = createPendingEdit(() => {
    if (!view) return;
    const nextText = view.state.doc.toString();
    try { submittedText = JSON.stringify(JSON.parse(nextText), null, 2); }
    catch { submittedText = nextText; }
    expectedEchoes.add(submittedText);
    stores.updateJson(address, nextText);
  }, () => composing || !!view?.composing);
  let error = $derived.by(() => {
    try { JSON.parse(editorText ?? text); return null; }
    catch (caught) {
      const message = caught instanceof Error ? caught.message : 'JSON 문법을 확인해 주세요.';
      const position = /position\s+(\d+)/i.exec(message);
      const lineColumn = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
      const offset = position ? Number(position[1]) : (editorText ?? text).length;
      const before = (editorText ?? text).slice(0, offset).split('\n');
      const line = lineColumn ? Number(lineColumn[1]) : before.length;
      const column = lineColumn ? Number(lineColumn[2]) : before[before.length - 1].length + 1;
      return `${line}행 ${column}열: JSON 문법을 확인해 주세요. (${message})`;
    }
  });

  onMount(() => {
    editorText = text;
    const unregister = registerPendingEdit(stores, edit);
    view = new EditorView({ parent: host, state: EditorState.create({ doc: text, extensions: [
      lineNumbers(), highlightActiveLine(), drawSelection(), history(), json(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': '항목 JSON', spellcheck: 'false' }),
      EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled),
      EditorView.domEventHandlers({
        compositionstart() { composing = true; edit.pause(); },
        input(event) {
          if (event.isComposing) { composing = true; edit.pause(); }
        },
        compositionend() {
          composing = false;
          // CodeMirror may finish applying the DOM composition in a microtask.
          queueMicrotask(() => {
            if (!view) return;
            edit.schedule();
            if (flushAfterComposition) { flushAfterComposition = false; edit.flush(); }
          });
        },
        blur() { if (!edit.flush()) flushAfterComposition = true; },
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const nextText = update.state.doc.toString();
        editorText = nextText;
        if (syncing) return;
        if (composing || update.view.composing) edit.markPending();
        else edit.schedule();
      }),
      EditorView.theme({
        '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', minHeight: '24rem', fontSize: '.88rem' },
        '.cm-content': { fontFamily: 'var(--font-mono)', padding: '.75rem 0' },
        '.cm-gutters': { backgroundColor: 'var(--sunken)', color: 'var(--muted)', borderColor: 'var(--border)' },
        '.cm-activeLine': { backgroundColor: 'var(--accent-soft)' },
        '.cm-activeLineGutter': { backgroundColor: 'var(--accent-soft)' },
        '.cm-cursor': { borderLeftColor: 'var(--text)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
      }),
    ] }) });
    return () => { edit.flush(); edit.cancel(); unregister(); view?.destroy(); view = undefined; };
  });

  // Keep external document updates in sync without reformatting the user's typing or IME composition.
  $effect(() => {
    const next = text;
    untrack(() => {
      const echo = expectedEchoes.delete(next);
      if (!view || echo || next === submittedText || edit.hasPending || composing || view.composing || view.state.doc.toString() === next) return;
      syncing = true;
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } }); }
      finally { syncing = false; }
    });
  });
</script>

<div class="json-host" bind:this={host}></div>
{#if error}<p class="json-error" role="alert">{error}</p>{/if}

<style>
  .json-host { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .json-host:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .json-error { margin: 0; padding: .6rem .8rem; font-size: .85rem; color: var(--danger); background: var(--danger-soft); border-radius: var(--radius-sm); overflow-wrap: anywhere; }
</style>
