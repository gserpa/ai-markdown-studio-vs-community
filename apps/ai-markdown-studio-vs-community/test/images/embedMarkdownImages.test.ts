import MarkdownIt from 'markdown-it';
import { describe, expect, it, vi } from 'vitest';
import { embedMarkdownImages } from '../../src/images/embedMarkdownImages';

const data = 'data:image/png;base64,aGVsbG8=';

describe('embedMarkdownImages', () => {
  it('embeds inline and reference images while preserving code and normal links', async () => {
    const source = [
      '---', 'document: presentation', '---', '# Images',
      '![A](<images/a b.png> "Caption")',
      '![B][shared] and [ordinary link][shared]',
      '', '[shared]: https://example.com/image.png "Remote caption"',
      '`![code](ignored.png)`',
      '```md', '![fenced](ignored.png)', '```',
    ].join('\n');
    const load = vi.fn(async () => data);
    const result = await embedMarkdownImages(source, load);
    expect(result.embedded).toBe(2);
    expect(load.mock.calls).toEqual([['images/a%20b.png'], ['https://example.com/image.png']]);
    expect(result.markdown).toContain('![A](<' + data + '> "Caption")');
    expect(result.markdown).toContain('![B](<' + data + '> "Remote caption")');
    expect(result.markdown).toContain('[ordinary link][shared]');
    expect(result.markdown).toContain('[shared]: https://example.com/image.png "Remote caption"');
    expect(result.markdown).toContain('`![code](ignored.png)`');
    expect(result.markdown).toContain('![fenced](ignored.png)');
  });

  it('handles repeated table cells, block quotes, lists, nested paths and CRLF', async () => {
    const source = ['| A | B |', '|---|---|', '| ![x](a.png) | ![x](a.png) |', '',
      '> ![quote](nested/a(1).png)', '', '- ![list](b.png)'].join('\r\n');
    const load = vi.fn(async () => data);
    const result = await embedMarkdownImages(source, load);
    expect(result.embedded).toBe(4);
    expect(result.markdown.split(data)).toHaveLength(5);
    expect(result.markdown).toContain('\r\n> ![quote](<' + data + '>)');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('embeds HTML images without altering their attributes or escaped examples', async () => {
    const source = '<div>\n<img src="a.png" alt="A" width="200">\n</div>\n\nText <img src=\'b.png\' alt="B">\n\n`<img src="ignored.png">`';
    const result = await embedMarkdownImages(source, async () => data);
    expect(result.embedded).toBe(2);
    expect(result.markdown).toContain('<img src="' + data + '" alt="A" width="200">');
    expect(result.markdown).toContain('<img src=\'' + data + '\' alt="B">');
    expect(result.markdown).toContain('`<img src="ignored.png">`');
  });

  it('skips existing embedded images and leaves failed links intact', async () => {
    const result = await embedMarkdownImages('![embedded](' + data + ')\n\n![missing](missing.png)\n\n![ok](ok.png)', async (source) => {
      if (source === 'missing.png') throw new Error('File not found');
      return data;
    });
    expect(result.embedded).toBe(1);
    expect(result.failures).toEqual([{ source: 'missing.png', message: 'File not found' }]);
    expect(result.markdown).toContain('![missing](missing.png)');
    const rendered = new MarkdownIt().render(result.markdown);
    expect(rendered.match(/src="data:image\/png/g)).toHaveLength(2);
  });

  it('keeps SVG embeds renderable and does not embed commented images or lazy-load attributes', async () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zy8+';
    const load = vi.fn(async () => svg);
    const result = await embedMarkdownImages('![Vector](vector.svg "Title")\n\n<!-- <img src="ignored.png"> -->\n\n<img data-src="ignored.png" src="actual.svg" alt="A">', load);
    expect(result.embedded).toBe(2);
    expect(load.mock.calls).toEqual([['vector.svg'], ['actual.svg']]);
    expect(result.markdown).toContain('<img src="' + svg + '" alt="Vector" title="Title">');
    expect(new MarkdownIt({ html: true }).render(result.markdown)).toContain('src="' + svg + '"');
    expect(result.markdown).toContain('data-src="ignored.png"');
  });
});
