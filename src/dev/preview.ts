// Dev-only UI preview with mock stores: /src/dev/preview.html?doc=charx|risum|lorebook|book|empty&theme=light|dark
// Not part of the production build (vite builds only the root index.html).
import { mount } from 'svelte';
import type { EditableDocument } from '$contracts';
import EditorApp from '../components/EditorApp.svelte';
import { createMockStores } from './mockStores';
import { sampleCharacterBook, sampleCharx, sampleLorebook, sampleRisum } from './samples';

const params = new URLSearchParams(location.search);
const docs: Record<string, EditableDocument | null> = {
  charx: richer(sampleCharx), risum: sampleRisum, lorebook: sampleLorebook, book: sampleCharacterBook, empty: null,
};

/** Adds a few realistic entries so list density and long text can be judged. */
function richer(doc: EditableDocument): EditableDocument {
  const copy = structuredClone(doc);
  if (copy.kind !== 'charx' || !copy.module) return copy;
  copy.card.data.alternate_greetings = ['비가 오네요.\n창가 자리에 앉을래요?', '오늘은 조용한 날이에요.'];
  copy.card.data.description = `${copy.card.data.description}\n\n${'솔렌은 낡은 목록 카드를 한 장씩 넘기며 이야기의 흔적을 찾아요. '.repeat(6)}`;
  copy.module.module.lorebook = [
    ...(copy.module.module.lorebook ?? []),
    { comment: '세계관', key: '', secondkey: '', insertorder: 50, content: '항상 적용되는 세계관 설명이에요.', mode: 'constant', alwaysActive: true, selective: false },
    { comment: '전설의 서고', key: '서고, 지하', secondkey: '전설', insertorder: 80, content: '지하 깊은 곳에 잠든 서고.', mode: 'normal', alwaysActive: false, selective: true },
    { comment: '계절', key: '', secondkey: '', insertorder: 10, content: '', mode: 'folder', alwaysActive: false, selective: false },
  ];
  return copy;
}

const stores = createMockStores({
  doc: docs[params.get('doc') ?? 'charx'] ?? null,
  dirty: params.has('dirty'),
  settings: params.get('theme') === 'dark' ? { theme: 'dark' } : params.get('theme') === 'light' ? { theme: 'light' } : {},
});
mount(EditorApp, { target: document.getElementById('app')!, props: { stores } });
