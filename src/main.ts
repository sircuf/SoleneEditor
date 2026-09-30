import { mount } from 'svelte';
import App from './App.svelte';
import { formats } from './formats';
import { createStorage } from './storage';
import { createServices } from './services';
import { downloadFile, newId, readFile, sha256Hex } from './services/adapters';
import { createEditorStores } from './stores';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Missing app mount target');
}

async function initializeEditor() {
  const storage = await createStorage();
  const services = createServices({ storage, formats, download: downloadFile, now: Date.now, newId, sha256Hex });
  const stores = createEditorStores({ storage, services, formats, readFile });
  try {
    await stores.initialize();
    return stores;
  } catch (error) {
    await stores.dispose().catch(() => {});
    throw error;
  }
}

const ready = initializeEditor();

window.addEventListener('pagehide', () => {
  void ready.then(stores => stores.dispose()).catch(error => {
    console.error('편집기를 종료하는 중 오류가 발생했어요.', error);
  });
}, { once: true });

// A page restored from the back/forward cache has already disposed its stores.
window.addEventListener('pageshow', event => {
  if (event.persisted) window.location.reload();
});

mount(App, { target, props: { ready } });
