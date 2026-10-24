import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewDocumentUpdater } from '../../src/panel/PreviewDocumentUpdater';
import type { PreviewPage } from '../../src/panel/previewHtmlBuilder';

const page = (body: string, compatibilityKey = 'assets-1', mode: PreviewPage['mode'] = 'document'): PreviewPage => ({
  html: `<html>${body}</html>`, body, compatibilityKey, mode, sessionId: `session-${body}`,
});
function setup() {
  const writes: string[] = [];
  const webview = {
    set html(value: string) { writes.push(value); },
    get html() { return writes.at(-1) ?? ''; },
    postMessage: vi.fn(async (_message: any) => true),
  };
  const updater = new PreviewDocumentUpdater(webview);
  const ready = (sessionId = 'session-first') => updater.handleMessage({ command: 'previewReady', sessionId });
  const ack = (revision = 1, applied = true, sessionId = 'session-first') => updater.handleMessage({ command: 'documentUpdateResult', sessionId, revision, applied });
  return { updater, webview, writes, ready, ack };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('PreviewDocumentUpdater', () => {
  it('debounces rendering and sends only the latest edit, then skips a duplicate save', () => {
    const { updater, webview, writes, ready, ack } = setup();
    updater.refresh(() => page('first')); ready();
    const build = vi.fn(() => page('latest'));
    updater.refresh(() => page('intermediate'), true);
    vi.advanceTimersByTime(100);
    updater.refresh(build, true);
    vi.advanceTimersByTime(149);
    expect(build).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(build).toHaveBeenCalledOnce();
    expect(webview.postMessage).toHaveBeenCalledExactlyOnceWith({ command: 'updateDocument', sessionId: 'session-first', revision: 1, body: 'latest' });
    ack();
    updater.refresh(() => page('latest'));
    expect(writes).toHaveLength(1);
    expect(webview.postMessage).toHaveBeenCalledTimes(1);
    updater.dispose();
  });

  it('buffers edits until ready and ignores messages from replaced pages', () => {
    const { updater, webview, writes, ready } = setup();
    updater.refresh(() => page('first'));
    updater.refresh(() => page('second'));
    updater.refresh(() => page('third'));
    ready('old-session');
    expect(webview.postMessage).not.toHaveBeenCalled();
    ready();
    expect(webview.postMessage.mock.calls[0][0].body).toBe('third');
    updater.refresh(() => page('new-assets', 'assets-2'));
    ready(); // stale ready cannot change the newer page
    expect(writes).toHaveLength(2);
    expect(webview.html).toBe(page('new-assets').html);
    updater.dispose();
  });

  it('serializes updates and coalesces changes during an outstanding acknowledgement', () => {
    const { updater, webview, ready, ack } = setup();
    updater.refresh(() => page('first')); ready();
    updater.refresh(() => page('second'));
    updater.refresh(() => page('third'));
    updater.refresh(() => page('fourth'));
    expect(webview.postMessage).toHaveBeenCalledTimes(1);
    ack(99); ack(1, true, 'old-session');
    expect(webview.postMessage).toHaveBeenCalledTimes(1);
    ack();
    expect(webview.postMessage.mock.calls[1][0]).toMatchObject({ revision: 2, body: 'fourth' });
    ack(2);
    updater.dispose();
  });

  it('flushes a pending edit immediately on save and cancels timers on close', () => {
    const { updater, webview, ready } = setup();
    updater.refresh(() => page('first')); ready();
    const pending = vi.fn(() => page('old-edit'));
    updater.refresh(pending, true);
    updater.refresh(() => page('saved'));
    expect(webview.postMessage.mock.calls[0][0].body).toBe('saved');
    updater.refresh(pending, true);
    updater.dispose();
    vi.runAllTimers();
    expect(pending).not.toHaveBeenCalled();
    expect(webview.postMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['undelivered', 'rejected', 'throws', 'timeout', 'not-applied', 'not-ready'] as const)('reloads the newest snapshot if an update is %s', async failure => {
    const { updater, webview, writes, ready, ack } = setup();
    updater.refresh(() => page('first'));
    if (failure !== 'not-ready') ready();
    if (failure === 'undelivered') webview.postMessage.mockResolvedValue(false);
    if (failure === 'rejected') webview.postMessage.mockRejectedValue(new Error('Closed webview'));
    if (failure === 'throws') webview.postMessage.mockImplementation(() => { throw new Error('Disposed webview'); });
    updater.refresh(() => page('second'));
    updater.refresh(() => page('latest'));
    if (failure === 'not-applied') ack(1, false);
    if (failure === 'timeout' || failure === 'not-ready' || failure === 'throws') vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(writes).toEqual(failure === 'throws'
      ? [page('first').html, page('second').html, page('latest').html]
      : [page('first').html, page('latest').html]);
    updater.dispose();
  });

  it('reloads for incompatible assets or presentation mode', () => {
    const { updater, writes, ready } = setup();
    updater.refresh(() => page('first')); ready();
    updater.refresh(() => page('assets', 'assets-2'));
    updater.refresh(() => page('slides', 'assets-2', 'presentation'));
    expect(writes).toHaveLength(3);
    updater.dispose();
  });

  it('restores the newest full snapshot if the webview context is recreated', () => {
    const { updater, writes, ready, ack } = setup();
    updater.refresh(() => page('first')); ready();
    updater.refresh(() => page('latest')); ack();
    ready();
    expect(writes).toEqual([page('first').html, page('latest').html]);
    updater.dispose();
  });
});
