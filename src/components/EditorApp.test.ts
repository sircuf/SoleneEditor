// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { EditorView } from '@codemirror/view';
import type { ImportChoice } from '$contracts';
import { createMockStores } from '../dev/mockStores';
import { sampleCharacterBook, sampleLorebook } from '../dev/samples';
import EditorApp from './EditorApp.svelte';

// The shared Vitest config is Node-first. Resolve the public Svelte runtime to
// its browser entry for this DOM suite without changing other agents' config.
vi.mock('svelte', () => {
  // @ts-expect-error The browser entry shares the public svelte type declarations.
  return import('../../node_modules/svelte/src/index-client.js');
});

beforeAll(() => {
  // jsdom has no layout engine; CodeMirror uses these APIs during measurement.
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('EditorApp with the standalone mock', () => {
  it('switches tabs and selects the requested collection item', async () => {
    const stores = createMockStores();
    const select = vi.spyOn(stores, 'select');
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '로어북' }));
    await fireEvent.click(screen.getByRole('button', { name: '등장인물' }));
    expect(select).toHaveBeenLastCalledWith('lorebook', 1);
    expect(get(stores.ui).selectedIndex).toBe(1);
    expect((screen.getByLabelText('내용') as HTMLTextAreaElement).value).toBe('솔렌은 오래된 책을 수집해요.');
  });

  it('edits a form by replacing the selected item and retains unknown fields', async () => {
    const stores = createMockStores({ doc: sampleLorebook });
    const update = vi.spyOn(stores, 'updateItem');
    const screen = render(EditorApp, { stores });
    const content = screen.getByLabelText('내용');
    await fireEvent.input(content, { target: { value: '한글로 바꾼 내용이에요.' } });
    expect(update).not.toHaveBeenCalled(); // debounced
    await fireEvent.blur(content);
    expect(update).toHaveBeenCalledWith({ tab: 'lorebook', format: 'risu', index: 0 }, expect.objectContaining({
      content: '한글로 바꾼 내용이에요.', custom_note: { keep: true },
    }));
    const record = get(stores.workspace).record;
    expect(record?.dirty).toBe(true);
    if (record?.doc.kind !== 'lorebook') throw new Error('Expected lorebook');
    expect(record.doc.book.data[1].content).toBe(sampleLorebook.book.data[1].content);
    expect(screen.getByText('기타 필드 1개 (JSON에서 편집)')).toBeTruthy();
  });

  it('edits one card field while card JSON contains the entire card data', async () => {
    const stores = createMockStores();
    const edit = vi.spyOn(stores, 'setCardField');
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '첫 메시지' }));
    await fireEvent.input(screen.getByRole('textbox', { name: '첫 메시지' }), { target: { value: '새 인사예요.' } });
    await waitFor(() => expect(edit).toHaveBeenCalledWith('first_mes', '새 인사예요.'));
    await fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    const view = EditorView.findFromDOM(screen.container.querySelector('.cm-editor')!);
    expect(JSON.parse(view!.state.doc.toString())).toMatchObject({ first_mes: '새 인사예요.', name: '솔렌', custom_field: 42 });
  });

  it('sends selected-item JSON, blocks form/navigation/export on an invalid draft, and allows discard', async () => {
    const stores = createMockStores({ doc: sampleLorebook });
    const updateJson = vi.spyOn(stores, 'updateJson');
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '등장인물' }));
    await fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    const view = EditorView.findFromDOM(screen.container.querySelector('.cm-editor')!)!;
    expect(JSON.parse(view.state.doc.toString())).toMatchObject({ comment: '등장인물' });
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '{\n "content":' } });
    await waitFor(() => expect((screen.getByRole('button', { name: '폼' }) as HTMLButtonElement).disabled).toBe(true));
    expect(updateJson).toHaveBeenLastCalledWith({ tab: 'lorebook', format: 'risu', index: 1 }, '{\n "content":');
    expect((screen.getByRole('button', { name: '내보내기' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '솔렌의 도서관' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/2행 .*열: JSON 문법/)).toBeTruthy();
    expect(get(stores.workspace).record?.dirty).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'JSON 초안 버리기' }));
    expect(get(stores.draft)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '폼' }));
    expect((screen.getByLabelText('내용') as HTMLTextAreaElement).value).toBe('솔렌은 오래된 책을 수집해요.');
  });

  it.each([
    ['내보내고 계속', 'export-then-continue'], ['그냥 계속', 'continue'], ['취소', 'cancel'],
  ] as const)('import confirmation %s sends %s', async (button, choice: ImportChoice) => {
    const stores = createMockStores({ dirty: true });
    const confirm = vi.spyOn(stores, 'confirmImport');
    const screen = render(EditorApp, { stores });
    await fireEvent.change(screen.getByLabelText('가져올 파일'), { target: { files: [new File(['mock'], 'next.risum')] } });
    const dialog = screen.getByRole('dialog', { name: '새 파일 가져오기' });
    expect(within(dialog).getByText('새 파일을 가져오면 현재 작업과 스냅샷 1개가 모두 삭제돼요.')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '내보내고 계속' }));
    await fireEvent.click(within(dialog).getByRole('button', { name: button }));
    expect(confirm).toHaveBeenCalledWith(choice);
    expect(get(stores.workspace).record?.fileName).toBe(choice === 'cancel' ? 'sample.charx' : 'next.risum');
  });

  it('shows a light import confirmation even when the workspace is clean', async () => {
    const stores = createMockStores();
    const screen = render(EditorApp, { stores });
    await fireEvent.change(screen.getByLabelText('가져올 파일'), { target: { files: [new File(['mock'], 'next.json')] } });
    expect(screen.queryByText(/내보내지 않은 변경 내용/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '그냥 계속' }));
  });

  it('imports a dropped file into an empty workspace', async () => {
    const stores = createMockStores({ doc: null });
    const request = vi.spyOn(stores, 'requestImport');
    const screen = render(EditorApp, { stores });
    const file = new File(['sample'], 'book.json');
    await fireEvent.drop(screen.getByRole('button', { name: /편집할 파일을 가져와 주세요/ }), { dataTransfer: { files: [file] } });
    expect(request).toHaveBeenCalledWith(file);
    expect(get(stores.workspace).record?.kind).toBe('lorebook');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('adds and deletes a Character Book item after confirmation', async () => {
    const stores = createMockStores({ doc: sampleCharacterBook });
    const remove = vi.spyOn(stores, 'removeItem');
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '로어북' }));
    await fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(get(stores.ui).selectedIndex).toBe(1);
    await fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.click(within(screen.getByRole('dialog', { name: '항목 삭제' })).getByRole('button', { name: '삭제' }));
    expect(remove).toHaveBeenCalledWith({ tab: 'lorebook', format: 'character-book', index: 1 });
  });

  it('saves labeled snapshots and asks before restoring', async () => {
    const stores = createMockStores();
    const restore = vi.spyOn(stores, 'restoreSnapshot');
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '스냅샷' }));
    await fireEvent.input(screen.getByLabelText('스냅샷 이름 (선택)'), { target: { value: '편집 전' } });
    await fireEvent.submit(screen.getByLabelText('스냅샷 이름 (선택)').closest('form')!);
    expect(get(stores.snapshots)).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: '원본 복원' }));
    expect(restore).not.toHaveBeenCalled();
    await fireEvent.click(within(screen.getByRole('dialog', { name: '스냅샷 복원' })).getByRole('button', { name: '복원' }));
    expect(restore).toHaveBeenCalledWith('mock-1');
  });

  it('applies snapshot and theme settings through the contract', async () => {
    const stores = createMockStores();
    const update = vi.spyOn(stores, 'updateSettings');
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '설정' }));
    await fireEvent.change(screen.getByLabelText('자동 스냅샷 간격'), { target: { value: '10' } });
    await fireEvent.input(screen.getByLabelText('스냅샷 용량 한도 (MB)'), { target: { value: '25' } });
    await fireEvent.change(screen.getByLabelText('테마'), { target: { value: 'dark' } });
    await fireEvent.submit(screen.getByLabelText('테마').closest('form')!);
    expect(update).toHaveBeenCalledWith({ snapshotIntervalMin: 10, snapshotLimitMB: 25, theme: 'dark' });
    expect(screen.container.querySelector('[data-theme="dark"]')).toBeTruthy();
  });

  it('keeps line breaks inside one alternate greeting and adds/removes greetings', async () => {
    const stores = createMockStores();
    const edit = vi.spyOn(stores, 'setCardField');
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '다른 첫 메시지' }));
    await fireEvent.click(screen.getByRole('button', { name: '첫 메시지 추가' }));
    expect(edit).toHaveBeenLastCalledWith('alternate_greetings', ['']);
    const first = screen.getByLabelText('첫 메시지 1');
    await fireEvent.input(first, { target: { value: '첫 줄이에요.\n둘째 줄이에요.' } });
    await fireEvent.blur(first);
    expect(edit).toHaveBeenLastCalledWith('alternate_greetings', ['첫 줄이에요.\n둘째 줄이에요.']);
    await fireEvent.click(screen.getByRole('button', { name: '첫 메시지 1 삭제' }));
    expect(edit).toHaveBeenLastCalledWith('alternate_greetings', []);
  });

  it('does not commit while a Korean IME composition is in progress', async () => {
    const stores = createMockStores({ doc: sampleLorebook });
    const update = vi.spyOn(stores, 'updateItem');
    const screen = render(EditorApp, { stores });
    const content = screen.getByLabelText('내용') as HTMLTextAreaElement;
    await fireEvent.focus(content);
    await fireEvent.compositionStart(content);
    content.value = '한';
    content.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    await fireEvent.blur(content); // blur mid-composition must not commit partial text
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(update).not.toHaveBeenCalled();
    content.value = '한글';
    await fireEvent.compositionEnd(content);
    await waitFor(() => expect(update).toHaveBeenCalledWith(
      { tab: 'lorebook', format: 'risu', index: 0 }, expect.objectContaining({ content: '한글' })));
  });

  it('flushes a debounced edit before exporting', async () => {
    const stores = createMockStores({ doc: sampleLorebook });
    const exportFile = vi.spyOn(stores, 'exportFile');
    const update = vi.spyOn(stores, 'updateItem');
    const screen = render(EditorApp, { stores });
    await fireEvent.input(screen.getByLabelText('내용'), { target: { value: '마지막 수정이에요.' } });
    expect(update).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    expect(update).toHaveBeenCalledWith(
      { tab: 'lorebook', format: 'risu', index: 0 }, expect.objectContaining({ content: '마지막 수정이에요.' }));
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(exportFile.mock.invocationCallOrder[0]);
  });

  it.each(['error', 'warning'] as const)('shows export %s issues and only errors block export', async (severity) => {
    const stores = createMockStores({ dirty: true, exportIssues: [{ severity, path: '/card/data/name', message: '이름을 확인해 주세요.' }] });
    const screen = render(EditorApp, { stores });
    await fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    const result = screen.getByRole('status', { name: '내보내기 결과' });
    expect(within(result).getByText(/이름을 확인해 주세요/)).toBeTruthy();
    expect(get(stores.status).dirty).toBe(severity === 'error');
  });
});
