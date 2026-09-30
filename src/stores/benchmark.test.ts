import { performance } from 'node:perf_hooks';
import { get } from 'svelte/store';
import { expect, it, vi } from 'vitest';
import { createEditorStores } from './index';
import { createServices } from '../services';
import { context, entry, workspace } from '../services/test-helpers';
import type { EditableDocument } from '$contracts';

it('reports updateItem time for 2,000 charx lorebook entries with 2 KiB content', async () => {
  vi.useFakeTimers();
  const content = 'x'.repeat(2048);
  const doc: EditableDocument = {
    kind: 'charx', card: { data: { name: 'benchmark', unknownCard: true } },
    module: {
      type: 'risuModule', unknownEnvelope: true,
      module: { name: 'benchmark', description: '', id: 'benchmark', lorebook: Array.from({ length: 2000 }, () => entry(content)) },
    },
  };
  const ctx = context(workspace(doc));
  const services = createServices(ctx.deps);
  const stores = createEditorStores({ storage: ctx.storage, formats: ctx.formats, services, readFile: vi.fn() });
  try {
    await stores.initialize();
    const address = { tab: 'lorebook', format: 'risu', index: 1000 } as const;
    for (let index = 0; index < 5; ++index) stores.updateItem(address, entry(`${index}${content.slice(1)}`));
    const samples: number[] = [];
    for (let index = 0; index < 30; ++index) {
      const value = entry(`${index}${content.slice(String(index).length)}`);
      const start = performance.now();
      stores.updateItem(address, value);
      samples.push(performance.now() - start);
    }
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    console.info(`S3 updateItem average: ${average.toFixed(2)} ms (2,000 entries × 2 KiB; 5 warmups, 30 samples; timing is informational)`);
    expect(get(stores.workspace).record?.doc).toMatchObject({ module: { module: { lorebook: expect.any(Array) } } });
  } finally {
    await services.autosave.cancel();
    await stores.dispose();
    vi.useRealTimers();
  }
});
