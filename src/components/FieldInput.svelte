<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { DeepReadonly, EditorStores, JsonValue } from '$contracts';
  import type { FieldDefinition } from '../schemas/fields';
  import { fieldText } from './view';
  import { createPendingEdit, registerPendingEdit } from './pendingEdits';
  import Icon from './Icon.svelte';

  let { stores, field, value, disabled, oncommit }: {
    stores: EditorStores; field: FieldDefinition; value: DeepReadonly<JsonValue> | undefined;
    disabled: boolean; oncommit: (value: JsonValue) => void;
  } = $props();
  let text = $state('');
  let checked = $state(false);
  let greetings = $state<{ id: number; text: string }[]>([]);
  let nextGreetingId = 0;
  const composing = new Set<string | number>();
  let flushAfterComposition = false;
  // While the user is typing here, the local buffer is the source of truth.
  // Store echoes are ignored until focus leaves, so the caret never jumps.
  let focused = false;
  let id = $derived(`field-${field.key}`);
  // A stored select value outside the known options is shown as-is and never rewritten.
  let options = $derived(field.options && text && !field.options.some((option) => option.value === text)
    ? [...field.options, { value: text, label: `${text} (알 수 없는 값)` }] : field.options ?? []);

  const edit = createPendingEdit(() => {
    let next: JsonValue;
    if (field.kind === 'boolean') next = checked;
    else if (field.kind === 'number') {
      if (!text.trim() || !Number.isFinite(Number(text))) return;
      next = Number(text);
    } else if (field.kind === 'string-list') next = text === '' ? [] : text.split('\n');
    else if (field.kind === 'multiline-list') next = greetings.map((greeting) => greeting.text);
    else next = text;
    oncommit(next);
  }, () => composing.size > 0);

  function load(source: DeepReadonly<JsonValue> | undefined): void {
    text = fieldText(source);
    checked = source === true;
    if (field.kind !== 'multiline-list') return;
    const next = Array.isArray(source) ? source.map(String) : [];
    // Keep row identities (and thus DOM focus) when the content is unchanged.
    if (next.length === greetings.length && next.every((entry, index) => entry === greetings[index].text)) return;
    greetings = next.map((entry) => ({ id: nextGreetingId++, text: entry }));
  }

  $effect(() => {
    const source = value;
    untrack(() => {
      if (focused || edit.hasPending || composing.size) return;
      load(source);
    });
  });

  onMount(() => {
    const unregister = registerPendingEdit(stores, edit);
    return () => { edit.flush(); edit.cancel(); unregister(); };
  });

  function capture(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, greetingId?: number): void {
    if (greetingId !== undefined) {
      const greeting = greetings.find((entry) => entry.id === greetingId);
      if (greeting) greeting.text = input.value;
    } else if (field.kind === 'boolean' && input instanceof HTMLInputElement) checked = input.checked;
    else text = input.value;
  }

  function input(event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }, greetingId?: number): void {
    capture(event.currentTarget, greetingId);
    if (event instanceof InputEvent && event.isComposing) composing.add(greetingId ?? field.key);
    if (composing.size) edit.markPending();
    else edit.schedule();
  }
  /** Discrete choices (toggle, select, list rows) commit at once; there is nothing to debounce. */
  function commitNow(): void {
    edit.markPending();
    edit.flush();
  }
  function change(event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }): void {
    capture(event.currentTarget);
    commitNow();
  }

  function focus(): void { focused = true; }
  function compositionStart(key: string | number): void { composing.add(key); edit.pause(); }
  function compositionEnd(event: CompositionEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement }, greetingId?: number): void {
    capture(event.currentTarget, greetingId);
    composing.delete(greetingId ?? field.key);
    edit.schedule();
    if (flushAfterComposition && !composing.size) { flushAfterComposition = false; edit.flush(); resync(); }
  }
  function blur(): void {
    focused = false;
    if (!edit.flush()) { flushAfterComposition = true; return; }
    // Focus may move to a sibling input of this field; let its focus event land first.
    setTimeout(resync, 0);
  }
  /** After leaving the field, show the stored value (e.g. a number normalized from "1.0"). */
  function resync(): void {
    if (!focused && !edit.hasPending && !composing.size) load(value);
  }
  function addGreeting(): void {
    if (!edit.ready) return;
    greetings.push({ id: nextGreetingId++, text: '' });
    commitNow();
  }
  function removeGreeting(greetingId: number): void {
    if (!edit.ready) return;
    greetings = greetings.filter((entry) => entry.id !== greetingId);
    commitNow();
  }
</script>

{#if field.kind === 'boolean'}
  <label class="switch">
    <input type="checkbox" role="switch" {checked} {disabled} onchange={change} onfocus={focus} onblur={blur} />
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    <span class="switch-label">{field.label}</span>
  </label>
{:else if field.kind === 'multiline-list'}
  <fieldset>
    <legend class="label">{field.label}<span class="counter">{greetings.length}개</span></legend>
    {#each greetings as greeting, index (greeting.id)}
      <div class="greeting">
        <div class="greeting-head">
          <label class="sub-label" for={`${id}-${greeting.id}`}>첫 메시지 {index + 1}</label>
          <button type="button" class="small danger" aria-label={`첫 메시지 ${index + 1} 삭제`} {disabled}
            onclick={() => removeGreeting(greeting.id)}><Icon name="trash" size={15} />삭제</button>
        </div>
        <textarea id={`${id}-${greeting.id}`} value={greeting.text} {disabled} spellcheck="false"
          oninput={(event) => input(event, greeting.id)} onfocus={focus} onblur={blur}
          oncompositionstart={() => compositionStart(greeting.id)} oncompositionend={(event) => compositionEnd(event, greeting.id)}></textarea>
      </div>
    {/each}
    <button type="button" class="small outline add" {disabled} onclick={addGreeting}><Icon name="plus" size={15} />첫 메시지 추가</button>
  </fieldset>
{:else}
  <div class="label-row">
    <label class="label" for={id}>{field.label}</label>
    {#if field.kind === 'long-text'}<span class="counter">{text.length.toLocaleString('ko-KR')}자</span>{/if}
  </div>
  {#if field.kind === 'select'}
    <select {id} value={text} {disabled} onchange={change} onfocus={focus} onblur={blur}>
      {#if !text}<option value="" disabled>선택해 주세요</option>{/if}
      {#each options as option}<option value={option.value}>{option.label}</option>{/each}
    </select>
  {:else if field.kind === 'long-text' || field.kind === 'string-list'}
    <textarea {id} class:mono={field.code} class:long={field.kind === 'long-text'} value={text} {disabled} spellcheck="false"
      oninput={input} onfocus={focus} onblur={blur} oncompositionstart={() => compositionStart(field.key)} oncompositionend={compositionEnd}></textarea>
  {:else}
    <input {id} class:mono={field.code} type={field.kind === 'number' ? 'number' : 'text'} step={field.kind === 'number' ? 'any' : undefined}
      value={text} {disabled} oninput={input} onfocus={focus} onblur={blur} oncompositionstart={() => compositionStart(field.key)} oncompositionend={compositionEnd} />
  {/if}
{/if}

<style>
  .label { font-size: .8rem; font-weight: 600; color: var(--text-soft); }
  .label-row { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
  .counter { font-size: .75rem; color: var(--faint); font-variant-numeric: tabular-nums; margin-left: .4rem; font-weight: 500; }
  textarea { min-height: 5.5rem; field-sizing: content; max-height: 70vh; }
  textarea.long { min-height: 9rem; }
  .greeting textarea { min-height: 7rem; }

  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; display: grid; gap: .75rem; }
  legend { padding: 0; margin-bottom: .4rem; }
  .greeting { display: grid; gap: .35rem; padding: .75rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .greeting-head { display: flex; align-items: center; justify-content: space-between; }
  .sub-label { font-size: .78rem; font-weight: 600; color: var(--muted); }
  .add { justify-self: start; }

  .switch { display: inline-flex; align-items: center; gap: .65rem; cursor: pointer; user-select: none; padding: .35rem 0; }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .track {
    position: relative; width: 2.3rem; height: 1.3rem; flex-shrink: 0; border-radius: 999px;
    background: var(--border-strong); transition: background .18s var(--ease);
  }
  .thumb {
    position: absolute; top: .15rem; left: .15rem; width: 1rem; height: 1rem; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / .25); transition: transform .18s var(--ease);
  }
  .switch input:checked + .track { background: var(--accent); }
  .switch input:checked + .track .thumb { transform: translateX(1rem); }
  .switch input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
  .switch input:disabled + .track { opacity: .5; }
  .switch-label { font-size: .9rem; color: var(--text); }
</style>
