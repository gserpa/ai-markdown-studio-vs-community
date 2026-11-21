import { describe, expect, it, vi } from 'vitest';
import { readReviewComments, writeReviewComments } from '@mfo/core';
import { preparePortableMarkdown } from '../../../src/export/html/portableMarkdown';

const image = 'data:image/png;base64,aGVsbG8=';

describe('portable Markdown snapshot', () => {
  it('embeds images without modifying front matter or moving an existing review selection', async () => {
    const source = '---\r\ntitle: Example\r\n---\r\n\r\n![Photo](local.png)\r\n\r\nReview this passage.\r\n';
    const start = source.indexOf('this passage');
    const original = writeReviewComments(source, [{
      id: '1', body: 'Check ![example](not-an-image.png)', state: 'resolved', includeInAi: false,
      range: { start, end: start + 'this passage'.length },
    }]);
    const load = vi.fn(async () => image);
    const result = await preparePortableMarkdown(original, load);
    const review = readReviewComments(result);
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith('local.png');
    expect(result).toContain('![Photo](<' + image + '>)');
    expect(result).toContain('title: Example');
    expect(review.comments[0]).toMatchObject({
      id: '1', body: 'Check ![example](not-an-image.png)', state: 'resolved', includeInAi: false,
    });
    expect(review.markdown.slice(review.comments[0].range!.start, review.comments[0].range!.end)).toBe('this passage');
    expect(original).toContain('![Photo](local.png)');
    expect(original).not.toContain(image);
  });

  it('reports failed images and malformed review data rather than returning a partial snapshot', async () => {
    await expect(preparePortableMarkdown('![broken](missing.png)', async () => {
      throw new Error('File not found');
    })).rejects.toThrow('missing.png: File not found');
    const load = vi.fn(async () => image);
    await expect(preparePortableMarkdown('---\nreview-comments: invalid\n---\n![image](local.png)', load))
      .rejects.toThrow('review-comments front matter could not be read');
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps only failed remote images as links and preserves review selections', async () => {
    const url = 'https://example.test/limited.png';
    const source = `![Local](local.png)\n\n![Remote](${url})\n\n<img src="${url}" alt="Remote">\n\nReview this passage.\n`;
    const start = source.indexOf('this passage');
    const annotated = writeReviewComments(source, [{
      id: '1', body: 'Check.', state: 'open', includeInAi: false,
      range: { start, end: start + 'this passage'.length },
    }]);
    const load = vi.fn(async (path: string) => {
      if (path === url) throw new Error('HTTP 429');
      return image;
    });
    const reportFallback = vi.fn();
    const result = await preparePortableMarkdown(annotated, load, reportFallback);
    const review = readReviewComments(result);
    expect(result).toContain('![Local](<' + image + '>)');
    expect(result).toContain(`![Remote](${url})`);
    expect(result).toContain(`<img src="${url}" alt="Remote">`);
    expect(review.markdown.slice(review.comments[0].range!.start, review.comments[0].range!.end)).toBe('this passage');
    expect(reportFallback).toHaveBeenCalledExactlyOnceWith([{ source: url, message: 'HTTP 429' }]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not fall back to remote links when any local image fails', async () => {
    const reportFallback = vi.fn();
    await expect(preparePortableMarkdown('![Remote](https://example.test/a.png)\n\n![Local](missing.png)', async path => {
      throw new Error(path === 'missing.png' ? 'File not found' : 'HTTP 429');
    }, reportFallback)).rejects.toThrow('missing.png: File not found');
    expect(reportFallback).not.toHaveBeenCalled();
  });

  it('preserves a comment spanning an image while rewriting its source', async () => {
    const source = 'Before ![Photo](local.png) after.\n';
    const original = writeReviewComments(source, [{
      id: '1', body: 'Check.', state: 'open', includeInAi: true,
      range: { start: 0, end: source.indexOf(' after') + ' after'.length },
    }]);
    const result = await preparePortableMarkdown(original, async () => image);
    const review = readReviewComments(result);
    expect(review.markdown.slice(review.comments[0].range!.start, review.comments[0].range!.end))
      .toBe('Before ![Photo](<' + image + '>) after');
  });

  it('embeds images before a later horizontal rule and caches repeated loads', async () => {
    const source = '![First](local.png)\n\n---\n\n![Second](local.png)\n';
    const load = vi.fn(async () => image);
    const result = await preparePortableMarkdown(source, load);
    expect(load).toHaveBeenCalledOnce();
    expect(result.split(image)).toHaveLength(3);
    expect(result).toContain('\n\n---\n\n');
  });

  it('rejects rewriting an image when review markers are inside the rewritten syntax', async () => {
    const source = '---\nreview-comments:\n  - 1: "Check"\n---\n\n![A <!--review:1-->photo<!--/review:1-->](local.png)\n';
    expect(readReviewComments(source).comments[0].range).toBeDefined();
    await expect(preparePortableMarkdown(source, async () => image))
      .rejects.toThrow('embedding images would change a review comment or its selection');
  });
});
