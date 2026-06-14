import { describe, it, expect } from 'vitest';
import { createMarkdownRenderer, sanitizeRenderedHtml } from '../src/render/markdownRenderer';

describe('sanitizeRenderedHtml', () => {
  describe('dangerous constructs removed', () => {
    it('strips <script> tags and their content', () => {
      const input = '<p>Safe</p><script>alert("xss")</script>';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert(');
      expect(result).toContain('<p>Safe</p>');
    });

    it('strips <iframe> tags', () => {
      const input = '<p>Text</p><iframe src="https://evil.com"></iframe>';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<iframe');
    });

    it('strips <object> tags', () => {
      const input = '<object data="malware.swf"></object>';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<object');
    });

    it('strips <embed> tags', () => {
      const input = '<embed src="evil.swf">';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<embed');
    });

    it('strips <form> tags', () => {
      const input = '<form action="https://evil.com"><input type="text"></form>';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<form');
    });

    it('strips on* event handler attributes', () => {
      const input = '<p onclick="alert(1)">Click me</p>';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('onclick');
      expect(result).toContain('<p>Click me</p>');
    });

    it('strips javascript: hrefs', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeRenderedHtml(input);
      // The link should either have the href removed or the tag stripped
      expect(result).not.toContain('javascript:');
    });

    it('strips <style> tags that could inject CSS attacks', () => {
      const input = '<p>ok</p><style>body { display: none; }</style>';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<style');
    });

    it('strips <link> tags', () => {
      const input = '<link rel="stylesheet" href="https://evil.com/evil.css">';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<link');
    });

    it('strips <meta> tags', () => {
      const input = '<meta http-equiv="refresh" content="0;url=https://evil.com">';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('<meta');
    });
  });

  describe('safe content preserved', () => {
    it('preserves basic paragraph tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      const result = sanitizeRenderedHtml(input);
      expect(result).toBe('<p>Hello <strong>world</strong></p>');
    });

    it('preserves heading tags', () => {
      const input = '<h1>Title</h1><h2>Subtitle</h2>';
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<h2>Subtitle</h2>');
    });

    it('preserves anchor tags with safe href', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('href="https://example.com"');
    });

    it('preserves anchor tags with mailto href', () => {
      const input = '<a href="mailto:test@example.com">Email</a>';
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('href="mailto:test@example.com"');
    });

    it('preserves img tags with safe src', () => {
      const input = '<img src="https://example.com/img.png" alt="An image">';
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('<img');
      expect(result).toContain('src="https://example.com/img.png"');
      expect(result).toContain('alt="An image"');
    });

    it('preserves source tracking attributes for images', () => {
      const renderer = createMarkdownRenderer({
        resolveImageSrc: (rawPath) => rawPath,
      });
      const result = sanitizeRenderedHtml(renderer.render('![Alt](https://example.com/img.png)'));
      expect(result).toContain('data-source-src="https://example.com/img.png"');
    });

    it('preserves table structure', () => {
      const input = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('<table>');
      expect(result).toContain('<thead>');
      expect(result).toContain('<th>A</th>');
      expect(result).toContain('<td>1</td>');
    });

    it('preserves code blocks', () => {
      const input = '<pre><code class="hljs language-js">const x = 1;</code></pre>';
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('<pre>');
      expect(result).toContain('<code');
      expect(result).toContain('const x = 1;');
    });

    it('preserves task list checkboxes (disabled inputs)', () => {
      const input = '<input type="checkbox" disabled> Task';
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('<input');
      expect(result).toContain('type="checkbox"');
      expect(result).toContain('disabled');
    });

    it('preserves data-uri image src', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
      const input = `<img src="${dataUri}" alt="test">`;
      const result = sanitizeRenderedHtml(input);
      expect(result).toContain('data:image/png;base64,');
    });
  });

  describe('CSS style attribute filtering', () => {
    it('preserves safe color style', () => {
      const input = '<span style="color: #ff0000">Red</span>';
      const result = sanitizeRenderedHtml(input);
      // sanitize-html may normalize whitespace around ':'
      expect(result).toMatch(/color:\s*#ff0000/u);
    });

    it('preserves safe font-weight style', () => {
      const input = '<span style="font-weight: bold">Bold</span>';
      const result = sanitizeRenderedHtml(input);
      expect(result).toMatch(/font-weight:\s*bold/u);
    });

    it('removes expression() CSS injection attempts', () => {
      const input = '<span style="color: expression(alert(1))">text</span>';
      const result = sanitizeRenderedHtml(input);
      expect(result).not.toContain('expression(');
    });

    it('removes url() references from style', () => {
      const input = '<div style="background-color: url(javascript:alert(1))">text</div>';
      const result = sanitizeRenderedHtml(input);
      // The style value doesn't match the whitelist, so it's dropped
      expect(result).not.toContain('javascript:');
    });
  });
});

describe('createMarkdownRenderer Mermaid handling', () => {
  it('keeps fenced mermaid behavior unchanged', () => {
    const renderer = createMarkdownRenderer();
    const html = renderer.render('```mermaid\nflowchart TD\nA-->B\n```');

    expect(html).toContain('<div class="mermaid">flowchart TD\nA--&gt;B\n</div>');
  });

  it('does not treat plain Mermaid-looking text as a diagram unless fenced', () => {
    const renderer = createMarkdownRenderer();
    const html = renderer.render('- architecture overview\n- gantt schedule');

    expect(html).toContain('<li>architecture overview</li>');
    expect(html).toContain('<li>gantt schedule</li>');
    expect(html).not.toContain('<div class="mermaid">');
  });

  it('leaves architecture-beta text alone when it is not fenced', () => {
    const renderer = createMarkdownRenderer();

    expect(renderer.render('architecture-beta\nservice api(server)[API]')).not.toContain('<div class="mermaid">');
  });
});
