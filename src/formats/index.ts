import type { FormatsApi, GetAvailableTabs } from '$contracts';
import { charx } from './charx';
import { lorebook } from './lorebook';
import { risum } from './risum';
import { validate } from './validate';

export const getAvailableTabs: GetAvailableTabs = (doc) => {
  switch (doc.kind) {
    case 'charx': return doc.module === null ? ['card', 'lorebook'] : ['card', 'module', 'lorebook', 'regex', 'trigger'];
    case 'risum': return ['module', 'lorebook', 'regex', 'trigger'];
    case 'lorebook': return ['lorebook'];
  }
};

export const formats: FormatsApi = {
  registry: { charx, risum, lorebook },
  detectKind(fileName, bytes) {
    for (const kind of ['charx', 'risum', 'lorebook'] as const) {
      if (formats.registry[kind].detect(fileName, bytes)) return kind;
    }
    return null;
  },
  getAvailableTabs,
  validate,
};
