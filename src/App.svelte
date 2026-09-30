<script lang="ts">
  import type { EditorStores } from '$contracts';
  import EditorApp from './components/EditorApp.svelte';

  let { ready }: { ready: Promise<EditorStores> } = $props();
</script>

{#await ready}
  <main class="startup" aria-busy="true">
    <h1>SoleneEditor</h1>
    <p role="status">저장된 작업을 불러오고 있어요.</p>
  </main>
{:then stores}
  <EditorApp {stores} />
{:catch error}
  <main class="startup" role="alert">
    <h1>편집기를 시작하지 못했어요.</h1>
    <p>페이지를 새로고침해서 다시 시도해 주세요.</p>
    {#if error instanceof Error}
      <details>
        <summary>오류 내용을 확인해요</summary>
        <pre>{error.message}</pre>
      </details>
    {/if}
  </main>
{/await}

<style>
  .startup {
    max-width: 40rem;
    margin: 4rem auto;
    padding: 1.5rem;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
  }

  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
