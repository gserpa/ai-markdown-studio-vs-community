import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { createMarkdownRenderer, readReviewComments, sanitizeRenderedHtml, writeReviewComments } from '@mfo/core';
import { createReviewPreviewTools, reviewContentKeySource } from '@mfo/review';
import { renderDocumentPreviewBody } from '../src/document/documentPreviewBody';
import { renderPresentationPreview } from '../src/presentation/presentationPreview';
import { loadPreviewThemeRegistryFromData } from '../src/presentation/previewThemeRegistry';
import { createPortableReviewBridge, createPortableReviewHost, readPortableReviewSelection, renderPortableReview } from './reviewPreviewHarness';

const presentationThemes = loadPreviewThemeRegistryFromData([{ name: 'test' }]);
const options = { presentationThemes, presentationTheme: 'test', themeMode: 'light' as const };

it.each(['document', 'presentation'] as const)('preserves Node source mappings and comments in a portable %s', async mode => {
  const isPresentation = mode === 'presentation';
  const source = `---\r\ntitle: Test\r\n${isPresentation ? 'document: presentation\r\n' : ''}---\r\n\r\n`
    + '# First\r\n\r\nFirst target.\r\n\r\n'
    + (isPresentation ? '---\r\n\r\n' : '')
    + '# Second\r\n\r\nSecond **target**. $x^2$\r\n\r\n'
    + '| Column |\r\n| --- |\r\n| Cell |\r\n\r\n'
    + '![Photo](data:image/png;base64,AAAA)\r\n\r\n'
    + '[Unsafe link](javascript:alert%281%29)\r\n';
  const start = source.lastIndexOf('target');
  const annotated = writeReviewComments(source, [
    { id: '1', body: 'Check the second target.', state: 'open', includeInAi: false, range: { start, end: start + 6 } },
  ]);
  const dom = new JSDOM('');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  const docs: JSDOM[] = [];
  try {
    const renderer = createMarkdownRenderer();
    const createNodeDocument = (html: string) => {
      const parsed = new JSDOM(html);
      docs.push(parsed);
      return parsed.window.document;
    };
    const tools = createReviewPreviewTools({
      createDocument: html => ({ document: createNodeDocument(html), dispose() {} }),
      renderAnchor: markdown => renderer.render(markdown),
      sanitize: sanitizeRenderedHtml,
    });

    const render = (markdown: string, lines?: readonly (number | undefined)[]) =>
      tools.renderReviewMarkdown(renderer, markdown, lines, 'map');
    const parsed = readReviewComments(annotated);
    const nodeBody = isPresentation
      ? renderPresentationPreview(parsed.markdown, render, presentationThemes, createNodeDocument, 'test', 'light', { includeSourceRanges: true }).html
      : renderDocumentPreviewBody(parsed.markdown, render);
    const key = createHash('sha256').update(reviewContentKeySource(parsed.markdown)).digest('hex');
    const node = tools.buildReviewPreview(nodeBody, parsed, 2, 'map', key);
    const browser = await renderPortableReview(annotated, 2, 'map', options);
    expect(browser.mode).toBe(mode);
    expect(browser.review.blocks).toEqual(node.review.blocks);
    const browserDocument = createNodeDocument(browser.body);
    expect(browserDocument.querySelector('.katex')).not.toBeNull();
    expect(browserDocument.querySelector('td')?.textContent).toBe('Cell');
    expect(browserDocument.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(browserDocument.querySelector('a[href^="javascript:"]')).toBeNull();
    if (isPresentation) expect(browserDocument.querySelectorAll('.presentation-slide')).toHaveLength(3);
    const browserState = JSON.parse(browserDocument.body.firstElementChild!.getAttribute('data-review-state')!);
    const nodeState = JSON.parse(createNodeDocument(node.body).body.firstElementChild!.getAttribute('data-review-state')!);
    expect(browserState).toEqual(nodeState);
    const slices = browserState.comments[0].placement.slices;
    expect(readPortableReviewSelection(parsed.markdown, browser.review, slices)).toEqual(parsed.comments[0].range);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
    for (const parsed of docs) parsed.window.close();
  }
});

it('applies review edits conditionally and preserves the source and rendered anchor', async () => {
  const source = '# Title\n\nA **target** here.\n';
  const start = source.indexOf('target');
  const annotated = writeReviewComments(source, [
    { id: '1', body: 'Original', state: 'open', includeInAi: false, range: { start, end: start + 6 } },
  ]);
  const dom = new JSDOM('');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost(annotated, 'session', options);
    const before = host.snapshot();
    const action = { sessionId: 'session', version: 1, requestId: 1, action: 'edit', id: '1', body: 'Revised', includeInAi: false };
    await host.review(action);
    const after = host.snapshot();
    expect(after.version).toBe(2);
    const stored = readReviewComments(after.markdown);
    expect(stored.markdown).toBe(readReviewComments(annotated).markdown);
    expect(stored.comments[0]).toMatchObject({ body: 'Revised', range: readReviewComments(annotated).comments[0].range, includeInAi: false });
    const state = (body: string) => {
      const template = dom.window.document.createElement('template');
      template.innerHTML = body;
      return JSON.parse(template.content.firstElementChild!.getAttribute('data-review-state')!);
    };
    expect(state(after.body).comments[0].placement).toEqual(state(before.body).comments[0].placement);
    await expect(host.review(action)).rejects.toThrow('preview changed');
    expect(host.snapshot()).toEqual(after);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('rejects concurrent edits to the same revision without overwriting the first', async () => {
  const source = '# Heading\n\nText to review.\n';
  const dom = new JSDOM('');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost(source, 'session', options);
    const request = { sessionId: 'session', version: 1, action: 'add', selection: [{ id: '1', start: 0, end: 4 }] };
    const outcomes = await Promise.allSettled([
      host.review({ ...request, requestId: 1, body: 'First' }),
      host.review({ ...request, requestId: 2, body: 'Second' }),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
    const snapshot = host.snapshot();
    expect(snapshot.version).toBe(2);
    expect(readReviewComments(snapshot.markdown).comments).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('connects the standalone document review UI without replacing its root or exposing AI controls', async () => {
  const source = '# Title\n\nA target here.\n';
  const start = source.indexOf('target');
  const annotated = writeReviewComments(source, [
    { id: '1', body: 'Original', state: 'open', includeInAi: false, resolution: 'Added <img src=x> examples.', range: { start, end: start + 6 } },
  ]);
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost(annotated, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    const bridge = createPortableReviewBridge(host, root, 'session');
    let changes = 0;
    dom.window.document.addEventListener('md-portable-review-changed', () => { changes += 1; });
    Object.assign(dom.window, { __previewBridge: bridge });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const list = dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="Review Comments"]')!;
    list.click();
    const aside = dom.window.document.querySelector('aside.md-review-list')!;
    expect(aside.hidden).toBe(false);
    expect(aside.textContent).not.toContain('Include in AI review');
    expect(aside.querySelector('.md-review-comment')?.textContent).toBe('Comment: Original');
    expect(aside.querySelector('.md-review-comment svg[aria-hidden="true"]')).not.toBeNull();
    expect(aside.querySelector('.md-review-resolution')?.textContent).toBe('Resolution: Added <img src=x> examples.');
    expect(aside.querySelector('.md-review-resolution svg[aria-hidden="true"]')).not.toBeNull();
    expect(aside.querySelector('.md-review-resolution img')).toBeNull();
    [...aside.querySelectorAll('button')].find(button => button.textContent === 'Edit')!.click();
    const resolution = dom.window.document.querySelector('.md-review-composer .md-review-resolution')!;
    expect(resolution.querySelector('strong')?.textContent).toBe('Resolution');
    expect(resolution.querySelector('.md-review-resolution-text')?.textContent).toBe('Added <img src=x> examples.');
    expect(resolution.querySelector('img')).toBeNull();
    const changedState = JSON.parse(root.getAttribute('data-review-state')!);
    changedState.comments[0].resolution = 'Updated summary.';
    root.setAttribute('data-review-state', JSON.stringify(changedState));
    dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
    expect(resolution.querySelector('.md-review-resolution-text')?.textContent).toBe('Updated summary.');
    expect(aside.querySelector('.md-review-resolution .is-reopened')).toBeNull();
    changedState.comments[0].resolutionReopened = true;
    root.setAttribute('data-review-state', JSON.stringify(changedState));
    dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
    expect(aside.querySelector('.md-review-resolution .is-reopened')?.textContent).toBe('Updated summary.');
    changedState.comments[0].state = 'resolved';
    root.setAttribute('data-review-state', JSON.stringify(changedState));
    dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
    expect(aside.querySelector('.md-review-resolution .is-reopened')).toBeNull();
    changedState.comments[0].state = 'open';
    delete changedState.comments[0].resolutionReopened;
    root.setAttribute('data-review-state', JSON.stringify(changedState));
    dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
    const textarea = dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!;
    expect(dom.window.document.querySelector('.md-review-composer')!.textContent).not.toContain('Include in AI review');
    textarea.value = 'Updated in browser';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.document.querySelector<HTMLFormElement>('.md-review-composer')!.requestSubmit();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(2));
    expect(readReviewComments(host.snapshot().markdown).comments[0]).toMatchObject({
      body: 'Updated in browser', includeInAi: false, resolution: 'Added <img src=x> examples.',
    });
    expect(dom.window.document.querySelector('[data-review-state]')).toBe(root);
    expect(JSON.parse(root.getAttribute('data-review-state')!).comments[0].body).toBe('Updated in browser');
    expect(changes).toBe(1);
    const messages: unknown[] = [];
    dom.window.addEventListener('message', event => messages.push(event.data));
    await bridge.review({ action: 'delete', id: '1', version: 1, requestId: 99 });
    expect(messages).toContainEqual(expect.objectContaining({ command: 'reviewResult', requestId: 99, error: expect.stringMatching(/preview changed/i) }));
    expect(changes).toBe(1);
    expect(host.snapshot().version).toBe(2);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('saves before another review action without consuming outside clicks or losing a failed edit', async () => {
  const source = '# Title\n\nAlpha Beta.\n';
  const comments = ['Alpha', 'Beta'].map((word, index) => {
    const start = source.indexOf(word);
    return { id: String(index + 1), body: word, state: 'open' as const, includeInAi: true,
      range: { start, end: start + word.length } };
  });
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost(writeReviewComments(source, comments), 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const requests: Array<{ action: string; requestId: number; body?: string }> = [];
    Object.assign(dom.window, { __previewBridge: {
      reviewStandalone: true, getState: () => ({}), review: (request: typeof requests[number]) => requests.push(request),
    } });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="Review Comments"]')!.click();
    const editButtons = [...dom.window.document.querySelectorAll<HTMLButtonElement>('.md-review-card button')]
      .filter(button => button.textContent === 'Edit');
    editButtons[0].click();
    const text = dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!;
    text.value = 'Changed Alpha';
    text.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const clickOutside = (target: HTMLElement) => {
      const down = new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
      Object.defineProperty(down, 'isPrimary', { value: true });
      target.dispatchEvent(down);
      target.click();
    };
    clickOutside(editButtons[1]);
    const first = requests.filter(request => request.action === 'edit').at(-1)!;
    expect(first.body).toBe('Changed Alpha');
    expect(dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!.value).toBe('Changed Alpha');
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { command: 'reviewResult', requestId: first.requestId, error: 'Could not save' },
    }));
    expect(dom.window.document.querySelector('.md-review-status')?.textContent)
      .toBe('Could not save The selected review action was not performed.');
    expect(text.disabled).toBe(false);
    clickOutside(editButtons[1]);
    const retry = requests.filter(request => request.action === 'edit').at(-1)!;
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { command: 'reviewResult', requestId: retry.requestId },
    }));
    expect(dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!.value).toBe('Beta');

    const outside = dom.window.document.createElement('button');
    let clicks = 0;
    outside.addEventListener('click', () => { clicks++; });
    dom.window.document.body.append(outside);
    clickOutside(outside);
    expect(clicks).toBe(1);
    expect(requests.filter(request => request.action === 'edit').at(-1)?.body).toBe('Beta');
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('keeps resolved comments read-only and marks previous resolutions after reopening', async () => {
  const source = '# Title\n\nA target here.\n';
  const start = source.indexOf('target');
  const annotated = writeReviewComments(source, [
    { id: '1', body: 'Original', state: 'resolved', includeInAi: true, resolution: 'Added an example.',
      range: { start, end: start + 6 } },
  ]);
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost(annotated, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    Object.assign(dom.window, { __previewBridge: createPortableReviewBridge(host, root, 'session') });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const reveal = () => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { command: 'revealReviewComment', id: '1' },
    }));
    reveal();
    const text = dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!;
    expect(text.readOnly).toBe(true);
    text.click();
    text.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(text.readOnly).toBe(true);
    expect(dom.window.document.querySelector<HTMLButtonElement>('.md-review-actions > button')!.hidden).toBe(true);
    expect(dom.window.document.querySelector('.md-review-resolution-text')!.classList.contains('is-reopened')).toBe(false);
    dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Reopen comment"]')!.click();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(2));
    expect(readReviewComments(host.snapshot().markdown).comments[0]).toMatchObject({
      state: 'open', resolution: 'Added an example.', resolutionReopened: true,
    });
    reveal();
    expect(dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!.readOnly).toBe(false);
    expect(dom.window.document.querySelector('.md-review-resolution-text')!.classList.contains('is-reopened')).toBe(true);
    dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Mark resolved"]')!.click();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(3));
    expect(readReviewComments(host.snapshot().markdown).comments[0].resolutionReopened).toBeUndefined();
    reveal();
    expect(dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!.readOnly).toBe(true);
    expect(dom.window.document.querySelector('.md-review-resolution-text')!.classList.contains('is-reopened')).toBe(false);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('preserves an edit when the comment is resolved elsewhere and lets the user reopen it', async () => {
  const source = '# Title\n\nA target here.\n';
  const start = source.indexOf('target');
  const annotated = writeReviewComments(source, [
    { id: '1', body: 'Original', state: 'open', includeInAi: true, resolution: 'Previously addressed.',
      range: { start, end: start + 6 } },
  ]);
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost(annotated, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    const bridge = createPortableReviewBridge(host, root, 'session');
    Object.assign(dom.window, { __previewBridge: bridge });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      data: { command: 'revealReviewComment', id: '1' },
    }));
    const text = dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!;
    text.value = 'Unsaved draft';
    text.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await bridge.review({ action: 'resolve', id: '1', version: 1, requestId: 99 });
    expect(text.readOnly).toBe(true);
    expect(text.value).toBe('Unsaved draft');
    expect(dom.window.document.querySelector('.md-review-status')?.textContent).toContain('resolved while editing');
    dom.window.document.body.click();
    expect(dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')?.value).toBe('Unsaved draft');
    dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Reopen comment"]')!.click();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(3));
    expect(text.readOnly).toBe(false);
    expect(text.value).toBe('Unsaved draft');
    expect(dom.window.document.querySelector('.md-review-resolution-text')!.classList.contains('is-reopened')).toBe(true);
    dom.window.document.querySelector<HTMLFormElement>('.md-review-composer')!.requestSubmit();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(4));
    expect(readReviewComments(host.snapshot().markdown).comments[0]).toMatchObject({
      body: 'Unsaved draft', state: 'open', resolutionReopened: true,
    });
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('retains the presentation review panel and its edited comment on the stable root', async () => {
  const source = '---\ndocument: presentation\n---\n\n# Slide\n\nA target here.\n';
  const start = source.indexOf('target');
  const annotated = writeReviewComments(source, [
    { id: '1', body: 'Original', state: 'open', includeInAi: true, resolution: 'Added an example.', range: { start, end: start + 6 } },
  ]);
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost(annotated, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    root.querySelector('.presentation-slide')!.classList.add('is-active');
    Object.assign(dom.window, { __previewBridge: createPortableReviewBridge(host, root, 'session') });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const panel = root.querySelector('.md-review-panel')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.md-review-revise')).toBeNull();
    expect(panel.querySelector('.md-review-comment')?.textContent).toBe('Comment: Original');
    expect(panel.querySelector('.md-review-comment svg[aria-hidden="true"]')).not.toBeNull();
    expect(panel.querySelector('.md-review-resolution')?.textContent).toBe('Resolution: Added an example.');
    expect(panel.querySelector('.md-review-resolution svg[aria-hidden="true"]')).not.toBeNull();
    expect(panel.querySelector('.md-review-resolution .is-reopened')).toBeNull();
    const state = JSON.parse(root.getAttribute('data-review-state')!);
    state.comments[0].resolutionReopened = true;
    root.setAttribute('data-review-state', JSON.stringify(state));
    dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
    expect(panel.querySelector('.md-review-resolution .is-reopened')?.textContent).toBe('Added an example.');
    state.comments[0].state = 'resolved';
    root.setAttribute('data-review-state', JSON.stringify(state));
    dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
    expect(panel.querySelector('.md-review-resolution .is-reopened')).toBeNull();
    state.comments[0].state = 'open';
    delete state.comments[0].resolutionReopened;
    root.setAttribute('data-review-state', JSON.stringify(state));
    dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
    panel.querySelector<HTMLButtonElement>('.md-review-panel-item')!.click();
    expect(dom.window.document.querySelector('.md-review-composer .md-review-resolution-text')?.textContent)
      .toBe('Added an example.');
    const textarea = dom.window.document.querySelector<HTMLTextAreaElement>('.md-review-composer textarea')!;
    textarea.value = 'Updated on slide';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    dom.window.document.querySelector<HTMLFormElement>('.md-review-composer')!.requestSubmit();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(2));
    expect(readReviewComments(host.snapshot().markdown).comments[0]).toMatchObject({
      body: 'Updated on slide', includeInAi: true, resolution: 'Added an example.',
    });
    expect(dom.window.document.querySelector('[data-review-state]')).toBe(root);
    expect(root.querySelector('.md-review-panel-item')!.textContent).toContain('Updated on slide');
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('offers presentation AI review only for eligible comments in the extension host', async () => {
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const source = '---\ndocument: presentation\n---\n\n# Slide\n\nA target here.\n';
    const host = await createPortableReviewHost(source, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector<HTMLElement>('[data-review-state]')!;
    const review = vi.fn();
    Object.assign(dom.window, { __previewBridge: { getState: () => ({}), review } });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const revise = root.querySelector<HTMLButtonElement>('.md-review-revise')!;
    expect(revise.hidden).toBe(true);

    const start = source.indexOf('target');
    const comment = { id: '1', body: 'Clarify', state: 'open' as const, includeInAi: true, range: { start, end: start + 6 } };
    for (const [comments, eligible] of [
      [[{ ...comment, includeInAi: false }], false],
      [[{ ...comment, state: 'resolved' as const }], false],
      [[{ ...comment, range: undefined }], false],
      [[comment], true],
    ] as const) {
      const annotated = writeReviewComments(source, [...comments]);
      const rendered = await renderPortableReview(annotated, 2, 'map', options);
      const template = dom.window.document.createElement('template');
      template.innerHTML = rendered.body;
      root.dataset.reviewState = template.content.firstElementChild!.getAttribute('data-review-state')!;
      dom.window.document.dispatchEvent(new dom.window.Event('md-document-updated'));
      expect(revise.hidden).toBe(!eligible);
    }
    revise.click();
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ action: 'revise', version: 2 }));
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('shows the presentation visibility toggle only while comments exist', async () => {
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost('---\ndocument: presentation\n---\n\n# Slide\n\nA target here.\n', 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    const bridge = createPortableReviewBridge(host, root, 'session');
    Object.assign(dom.window, { __previewBridge: bridge });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const toggle = root.querySelector<HTMLButtonElement>('.md-review-visibility')!;
    expect(toggle.hidden).toBe(true);

    const block = [...root.querySelectorAll('[data-review-block]')].find(item => item.textContent?.includes('target'))!;
    const start = block.textContent!.indexOf('target');
    const selection = [{ id: block.getAttribute('data-review-block')!, start, end: start + 6 }];
    await bridge.review({ action: 'add', body: 'Review', version: 1, requestId: 1, selection });
    expect(toggle.hidden).toBe(false);
    expect(toggle.textContent).toBe('Hide Review Comments');
    toggle.click();
    expect(toggle.textContent).toBe('Show Review Comments');

    await bridge.review({ action: 'delete', id: '1', version: 2, requestId: 2 });
    expect(toggle.hidden).toBe(true);
    expect(root.querySelector('.md-review-panel-empty')?.textContent).toBe('No review comments.');
    await bridge.review({ action: 'add', body: 'Another review', version: 3, requestId: 3, selection });
    expect(toggle.hidden).toBe(false);
    expect(toggle.textContent).toBe('Show Review Comments');
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('preserves code-block mapping for session IDs containing punctuation', async () => {
  const dom = new JSDOM('');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost('```text\nExample\n```\n', 'session-123', options);
    const template = dom.window.document.createElement('template');
    template.innerHTML = host.snapshot().body;
    expect(template.content.querySelector('pre[data-review-block]')).not.toBeNull();
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('round-trips add, resolve, reopen, reattach and delete without moving the selected text', async () => {
  const dom = new JSDOM('');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const host = await createPortableReviewHost('# Heading\n\nAlpha Beta.\n', 'session', options);
    const selection = (word: string) => {
      const template = dom.window.document.createElement('template');
      template.innerHTML = host.snapshot().body;
      const block = [...template.content.querySelectorAll('[data-review-block]')].find(item => item.textContent?.includes(word))!;
      const start = block.textContent!.indexOf(word);
      return [{ id: block.getAttribute('data-review-block')!, start, end: start + word.length }];
    };
    const send = async (request: { action: string; id?: string; body?: string; selection?: unknown }) => {
      const version = host.snapshot().version;
      await host.review({ ...request, version, requestId: version, sessionId: 'session' });
    };
    const stored = () => readReviewComments(host.snapshot().markdown);
    await send({ action: 'add', body: 'Review', selection: selection('Alpha') });
    expect(stored().markdown.slice(stored().comments[0].range!.start, stored().comments[0].range!.end)).toBe('Alpha');
    await send({ action: 'resolve', id: '1' });
    expect(stored().comments[0].state).toBe('resolved');
    await send({ action: 'reopen', id: '1' });
    expect(stored().comments[0].state).toBe('open');
    await send({ action: 'reattach', id: '1', selection: selection('Beta') });
    expect(stored().markdown.slice(stored().comments[0].range!.start, stored().comments[0].range!.end)).toBe('Beta');
    const reopened = await createPortableReviewHost(host.snapshot().markdown, 'reopened', options);
    const template = dom.window.document.createElement('template');
    template.innerHTML = reopened.snapshot().body;
    const state = JSON.parse(template.content.firstElementChild!.getAttribute('data-review-state')!);
    expect(state.comments[0]).toMatchObject({ body: 'Review', originalQuote: 'Beta', placement: expect.any(Object) });
    const before = host.snapshot();
    await expect(send({ action: 'reattach', id: '1', selection: [{ id: 'missing', start: 0, end: 4 }] })).rejects.toThrow();
    expect(host.snapshot()).toEqual(before);
    await send({ action: 'delete', id: '1' });
    expect(stored().comments).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('anchors repeated text on the selected presentation slide', async () => {
  const dom = new JSDOM('');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const source = '---\ndocument: presentation\n---\n\n# First\n\nRepeated target.\n\n---\n\n# Second\n\nRepeated target.\n';
    const host = await createPortableReviewHost(source, 'session', options);
    const template = dom.window.document.createElement('template');
    template.innerHTML = host.snapshot().body;
    const slide = template.content.querySelectorAll('.presentation-slide')[1];
    const block = [...slide.querySelectorAll('[data-review-block]')].find(item => item.textContent?.includes('target'))!;
    const start = block.textContent!.indexOf('target');
    await host.review({ action: 'add', body: 'Second slide', version: 1, requestId: 1, sessionId: 'session',
      selection: [{ id: block.getAttribute('data-review-block')!, start, end: start + 6 }] });
    const store = readReviewComments(host.snapshot().markdown);
    expect(store.comments[0].range!.start).toBe(store.markdown.lastIndexOf('target'));
    template.innerHTML = host.snapshot().body;
    const state = JSON.parse(template.content.firstElementChild!.getAttribute('data-review-state')!);
    expect(state.comments[0].placement.slices[0].id).toBe(block.getAttribute('data-review-block'));
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it.each(['document', 'presentation'] as const)('adds and restores a component text comment in a %s', async mode => {
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });

  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const source = (mode === 'presentation' ? '---\ndocument: presentation\n---\n\n# Slide\n\n' : '')
      + '~~~component\ntype: fact-cards\nversion: 1\ndata:\n  cards:\n'
      + '    - label: Repeated\n      value: First\n    - label: Repeated\n      value: Second\n~~~\n';
    const host = await createPortableReviewHost(source, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    root.querySelector('.presentation-slide')?.classList.add('is-active');
    Object.assign(dom.window, { __previewBridge: createPortableReviewBridge(host, root, 'session') });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const text = root.querySelectorAll('.md-fact-label')[1].firstChild!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(text);
    dom.window.getSelection()!.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
    const popover = dom.window.document.querySelector<HTMLElement>('.md-review-popover')!;
    expect(popover.hidden).toBe(false);
    popover.querySelector<HTMLButtonElement>('button')!.click();
    const textarea = popover.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Check this label';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    popover.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(2));
    const stored = readReviewComments(host.snapshot().markdown);
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe('Repeated');
    expect(stored.comments[0].range!.start).toBe(stored.markdown.lastIndexOf('Repeated'));
    expect(host.snapshot().markdown).toContain('component: true');
    const template = dom.window.document.createElement('template');
    template.innerHTML = host.snapshot().body;
    const state = JSON.parse(template.content.firstElementChild!.getAttribute('data-review-state')!);
    expect(state.comments[0].placement).toBeDefined();
    expect(template.content.querySelectorAll('.md-fact-label')[1].textContent).toBe('Repeated');
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it.each([
  ['record-list', 'data:\n  records:\n    - title: Example item\n      detail: Supporting detail', '.md-record-detail', 'Supporting'],
  ['status-matrix', 'data:\n  columns: [Scope, Design]\n  rows:\n    - label: Example row\n      cells: { Scope: Active, Design: Pending }', 'tbody th', 'Example'],
] as const)('anchors rendered %s text to its YAML', async (type, data, selector, quote) => {
  const dom = new JSDOM('');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const source = `~~~component\ntype: ${type}\nversion: 1\n${data}\n~~~\n`;
    const host = await createPortableReviewHost(source, 'session', options);
    const template = dom.window.document.createElement('template');
    template.innerHTML = host.snapshot().body;
    const element = template.content.querySelector(selector)!;
    const block = element.closest('[data-review-block]')!;
    const start = block.textContent!.indexOf(quote);
    await host.review({ action: 'add', body: 'Check this', version: 1, requestId: 1, sessionId: 'session',
      selection: [{ id: block.getAttribute('data-review-block')!, start, end: start + quote.length }] });
    const stored = readReviewComments(host.snapshot().markdown);
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe(quote);
    template.innerHTML = host.snapshot().body;
    const state = JSON.parse(template.content.firstElementChild!.getAttribute('data-review-state')!);
    expect(state.comments[0].placement).toBeDefined();
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it.each([
  ['document', 'fact-cards', 'data:\n  cards:\n    - label: First card\n      value: One\n    - label: Second card\n      value: Two', '[data-fact-card] .md-fact-label'],
  ['presentation', 'fact-cards', 'data:\n  cards:\n    - label: First card\n      value: One\n    - label: Second card\n      value: Two', '[data-fact-card] .md-fact-label'],
  ['document', 'record-list', 'data:\n  records:\n    - title: First record\n    - title: Second record', '[data-record-item] .md-record-title strong'],
  ['presentation', 'status-matrix', 'data:\n  columns: [Scope]\n  rows:\n    - label: First row\n      cells: { Scope: Active }\n    - label: Second row\n      cells: { Scope: Pending }', 'tbody th'],
] as const)('anchors a multi-item %s %s selection to the whole component', async (mode, type, data, selector) => {
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });

  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const source = `---\n${mode === 'presentation' ? 'document: presentation\n' : 'title: Example\n'}---\n\n`
      + (mode === 'presentation' ? '# Slide\n\n' : '')
      + `~~~component\ntype: ${type}\nversion: 1\n${data}\n~~~\n`;
    const host = await createPortableReviewHost(source, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    root.querySelector('.presentation-slide')?.classList.add('is-active');
    Object.assign(dom.window, { __previewBridge: createPortableReviewBridge(host, root, 'session') });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const nodes = root.querySelectorAll(selector);
    const first = nodes[0].firstChild!;
    const second = nodes[1].firstChild!;
    const range = dom.window.document.createRange();
    range.setStart(first, 0);
    range.setEnd(second, second.textContent!.length);
    dom.window.getSelection()!.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
    const popover = dom.window.document.querySelector<HTMLElement>('.md-review-popover')!;
    expect(popover.hidden).toBe(false);
    popover.querySelector<HTMLButtonElement>('button')!.click();
    const textarea = popover.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Review the component';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    popover.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(2));
    const saved = host.snapshot().markdown;
    const stored = readReviewComments(saved);
    expect(stored.markdown).toBe(source);
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe(`type: ${type}\nversion: 1\n${data}`);
    const reopened = await createPortableReviewHost(saved, 'reopened', options);
    const template = dom.window.document.createElement('template');
    template.innerHTML = reopened.snapshot().body;
    const state = JSON.parse(template.content.firstElementChild!.getAttribute('data-review-state')!);
    const block = template.content.querySelector('[data-review-component]')!;
    expect(state.comments[0].placement.slices).toEqual([{ id: block.getAttribute('data-review-block'), start: 0, end: block.textContent!.length }]);
    await reopened.review({ action: 'delete', id: '1', version: 1, requestId: 1, sessionId: 'reopened' });
    expect(reopened.snapshot().markdown).toBe(source);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it.each([
  ['document', 'fact-cards', 'data:\n  cards:\n    - label: First card\n      value: One', '.md-fact-label', '.md-fact-value strong'],
  ['presentation', 'fact-cards', 'data:\n  cards:\n    - label: First card\n      value: One', '.md-fact-label', '.md-fact-value strong'],
  ['document', 'fact-cards', 'data:\n  cards:\n    - label: First card\n      value: One\n      detail: |\n        First line\n        Second line', '.md-fact-detail', '.md-fact-detail'],
  ['document', 'record-list', 'data:\n  records:\n    - title: First record\n      detail: Supporting detail', '.md-record-title strong', '.md-record-detail'],
  ['presentation', 'status-matrix', 'data:\n  columns: [Scope]\n  rows:\n    - label: First row\n      cells: { Scope: Active }', 'tbody th', 'tbody .md-matrix-status'],
  ['presentation', 'status-matrix', 'data:\n  markdown-table: |\n    | Item | Scope |\n    | --- | --- |\n    | First row | Active |\n    | Second row | Pending |', 'thead .md-matrix-stage-label', 'tbody th'],
] as const)('anchors multiple lines of one %s %s item to the whole component', async (mode, type, data, firstSelector, lastSelector) => {
  const dom = new JSDOM('', { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window.Range.prototype, {
    getBoundingClientRect: () => ({ top: 20, bottom: 30, left: 20, right: 30, height: 10 }),
    getClientRects: () => [],
  });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('crypto', webcrypto);
  try {
    const source = `---\n${mode === 'presentation' ? 'document: presentation\n' : 'title: Example\n'}---\n\n`
      + (mode === 'presentation' ? '# Slide\n\n' : '')
      + `~~~component\ntype: ${type}\nversion: 1\n${data}\n~~~\n`;
    const host = await createPortableReviewHost(source, 'session', options);
    dom.window.document.body.innerHTML = host.snapshot().body;
    const root = dom.window.document.querySelector('[data-review-state]')!;
    root.querySelector('.presentation-slide')?.classList.add('is-active');
    Object.assign(dom.window, { __previewBridge: createPortableReviewBridge(host, root, 'session') });
    dom.window.eval(readFileSync(new URL('../assets/preview-review.js', import.meta.url), 'utf8'));
    const first = root.querySelector(firstSelector)!.firstChild!;
    const last = root.querySelector(lastSelector)!.firstChild!;
    const range = dom.window.document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.textContent!.length);
    dom.window.getSelection()!.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
    const popover = dom.window.document.querySelector<HTMLElement>('.md-review-popover')!;
    popover.querySelector<HTMLButtonElement>('button')!.click();
    const textarea = popover.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Review these lines';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    popover.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await vi.waitFor(() => expect(host.snapshot().version).toBe(2), { timeout: 500 });
    const stored = readReviewComments(host.snapshot().markdown);
    expect(stored.markdown).toBe(source);
    expect(stored.markdown.slice(stored.comments[0].range!.start, stored.comments[0].range!.end)).toBe(`type: ${type}\nversion: 1\n${data}`);
    const template = dom.window.document.createElement('template');
    template.innerHTML = host.snapshot().body;
    const state = JSON.parse(template.content.firstElementChild!.getAttribute('data-review-state')!);
    const block = template.content.querySelector('[data-review-component]')!;
    expect(state.comments[0].placement.slices).toEqual([{ id: block.getAttribute('data-review-block'), start: 0, end: block.textContent!.length }]);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});
