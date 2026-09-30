import type { CharxDocument, LorebookDocument, RisumDocument } from '$contracts';

export const sampleLorebook: LorebookDocument = {
  kind: 'lorebook',
  book: {
    type: 'risu', ver: 1, source_note: '폼에서 수정해도 보존되는 필드예요.',
    data: [
      { comment: '솔렌의 도서관', key: '도서관', secondkey: '', insertorder: 100,
        content: '낮은 창문으로 오후의 빛이 들어와요.', mode: 'normal', alwaysActive: false,
        selective: false, custom_note: { keep: true } },
      { comment: '등장인물', key: '솔렌', secondkey: '', insertorder: 101,
        content: '솔렌은 오래된 책을 수집해요.', mode: 'normal', alwaysActive: false, selective: false },
    ],
  },
};

export const sampleRisum: RisumDocument = {
  kind: 'risum',
  module: {
    type: 'risuModule', original_root: '보존해요.',
    module: {
      name: '도서관 모듈', description: '편집기를 살펴보는 샘플이에요.', id: 'sample-library',
      lorebook: sampleLorebook.book.data,
      regex: [{ comment: '인사 바꾸기', in: '안녕', out: '반가워요', type: 'editoutput' }],
      trigger: [{ comment: '수동 인사', type: 'manual', conditions: [], effect: [], custom: true }],
      extra_info: { kept: true },
    },
  },
};

export const sampleCharx: CharxDocument = {
  kind: 'charx',
  card: {
    spec: 'chara_card_v3', spec_version: '3.0',
    data: {
      name: '솔렌', description: '도서관에서 만난 이야기 수집가예요.', personality: '차분하고 호기심이 많아요.',
      first_mes: '어서 와요. 어떤 이야기를 찾고 있나요?', tags: ['도서관', '샘플'],
      extensions: { sample_unknown: '그대로 보존해요.' }, custom_field: 42,
    },
  },
  module: sampleRisum.module,
};

export const sampleCharacterBook: CharxDocument = {
  kind: 'charx',
  card: {
    spec: 'chara_card_v3', spec_version: '3.0',
    data: {
      name: '모듈 없는 카드', description: 'Character Book 항목을 직접 편집해요.',
      character_book: { scan_depth: 4, entries: [
        { name: '서가', keys: ['서가'], content: '책들이 가지런히 놓여 있어요.', enabled: true,
          insertion_order: 100, extensions: { untouched: true } },
      ] },
    },
  },
  module: null,
};
