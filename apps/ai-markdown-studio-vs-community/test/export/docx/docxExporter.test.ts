import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
  window: {
    showSaveDialog: vi.fn(),
  },
}));

vi.mock('html-to-docx', () => ({
  default: vi.fn(),
}));

vi.mock('../../../src/export/html/htmlExporter', () => ({
  buildExportHtmlString: vi.fn(),
}));

import {
  collectInternalFragmentRelationships,
  inlineLocalFileImagesForBasicDocx,
  patchBasicDocxDocumentXml,
  prepareHtmlForBasicDocx,
  stripInternalFragmentRelationships,
} from '../../../src/export/docx/docxExporter';

describe('prepareHtmlForBasicDocx', () => {
  it('removes standalone export assets and keeps only document content', () => {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<style>.markdown-body { color: red; }</style>',
      '<script>window.bad = "\\u0001";</script>',
      '</head>',
      '<body>',
      '<main class="markdown-body"><h1>Hello</h1><p>World</p></main>',
      '</body>',
      '</html>',
    ].join('');

    const result = prepareHtmlForBasicDocx(html);

    expect(result).toContain('<body><h1>Hello</h1><p>World</p></body>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<style>');
  });

  it('replaces mermaid blocks with readable code blocks', () => {
    const html = [
      '<!doctype html>',
      '<html><body>',
      '<main class="markdown-body">',
      '<div class="mermaid">flowchart TD\nA-->B</div>',
      '</main>',
      '</body></html>',
    ].join('');

    const result = prepareHtmlForBasicDocx(html);

    expect(result).toContain('<pre><code class="language-mermaid">flowchart TD\nA--&gt;B</code></pre>');
    expect(result).not.toContain('class="mermaid"');
  });
});

describe('inlineLocalFileImagesForBasicDocx', () => {
  it('replaces local file image sources with data URIs', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('png-bytes'));

    const html = '<!doctype html><html><body><img src="file:///C:/docs/example.png" alt="Example" /></body></html>';
    const result = await inlineLocalFileImagesForBasicDocx(html);

    expect(result).toContain('src="data:image/png;base64,cG5nLWJ5dGVz"');
    expect(result).not.toContain('src="file:///C:/docs/example.png"');
  });

  it('leaves non-file image sources unchanged', async () => {
    const html = '<!doctype html><html><body><img src="https://example.com/image.png" alt="Example" /></body></html>';
    const result = await inlineLocalFileImagesForBasicDocx(html);

    expect(result).toContain('src="https://example.com/image.png"');
  });
});

describe('basic DOCX OOXML patching', () => {
  it('removes the empty leading paragraph and rewrites fragment links to bookmarks', () => {
    const relationships = collectInternalFragmentRelationships([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#headings" TargetMode="External"/>',
      '</Relationships>',
    ].join(''));

    const documentXml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '  <w:body>',
      '    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>',
      '    <w:p><w:pPr><w:spacing w:lineRule="auto"/></w:pPr><w:r><w:rPr/><w:t xml:space="preserve"/></w:r></w:p>',
      '    <w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:lineRule="auto"/></w:pPr><w:r><w:rPr/><w:t xml:space="preserve">Headings</w:t></w:r></w:p>',
      '    <w:p><w:pPr><w:spacing w:lineRule="auto"/></w:pPr><w:hyperlink r:id="rId6"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">Headings</w:t></w:r></w:hyperlink></w:p>',
      '  </w:body>',
      '</w:document>',
    ].join('');

    const result = patchBasicDocxDocumentXml(documentXml, [{ id: 'headings', text: 'Headings' }], relationships);

    expect(result.xml).not.toContain('<w:t xml:space="preserve"/></w:r></w:p>');
    expect(result.xml).toContain('w:bookmarkStart w:id="1" w:name="headings"');
    expect(result.xml).toContain('w:bookmarkEnd w:id="1"');
    expect(result.xml.indexOf('w:bookmarkStart w:id="1" w:name="headings"')).toBeLessThan(
      result.xml.indexOf('w:bookmarkEnd w:id="1"'),
    );
    expect(result.xml).toMatch(/<w:hyperlink\s+w:anchor="headings"\s+w:history="1">/);
    expect(result.bookmarkNames.has('headings')).toBe(true);
    expect(result.bookmarkAnchors.get('headings')).toBe('headings');
  });

  it('places bookmarks on matching heading paragraphs instead of earlier links with the same text', () => {
    const relationships = collectInternalFragmentRelationships([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rId18" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#tables" TargetMode="External"/>',
      '</Relationships>',
    ].join(''));
    const documentXml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '  <w:body>',
      '    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>',
      '    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Kitchen Sink Sample Document</w:t></w:r></w:p>',
      '    <w:p><w:pPr><w:spacing w:lineRule="auto"/></w:pPr><w:hyperlink r:id="rId18"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">Tables</w:t></w:r></w:hyperlink></w:p>',
      '    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">Tables</w:t></w:r></w:p>',
      '  </w:body>',
      '</w:document>',
    ].join('');

    const result = patchBasicDocxDocumentXml(documentXml, [{ id: 'tables', text: 'Tables' }], relationships);
    const linkedTablesMatch = /<w:hyperlink\s+w:anchor="tables"\s+w:history="1">/u.exec(result.xml);
    const linkedTablesIndex = linkedTablesMatch?.index ?? -1;
    const bookmarkIndex = result.xml.indexOf('w:bookmarkStart w:id="1" w:name="tables"');

    expect(linkedTablesIndex).toBeGreaterThan(0);
    expect(bookmarkIndex).toBeGreaterThan(linkedTablesIndex);
  });

  it('uses Word-safe bookmark names for markdown heading ids with hyphens', () => {
    const relationships = collectInternalFragmentRelationships([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#blockquotes-and-horizontal-rule" TargetMode="External"/>',
      '</Relationships>',
    ].join(''));
    const documentXml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '  <w:body>',
      '    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>',
      '    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">Blockquotes and Horizontal Rule</w:t></w:r></w:p>',
      '    <w:p><w:hyperlink r:id="rId10"><w:r><w:t xml:space="preserve">Blockquotes and Horizontal Rule</w:t></w:r></w:hyperlink></w:p>',
      '  </w:body>',
      '</w:document>',
    ].join('');

    const result = patchBasicDocxDocumentXml(
      documentXml,
      [{ id: 'blockquotes-and-horizontal-rule', text: 'Blockquotes and Horizontal Rule' }],
      relationships,
    );

    expect(result.bookmarkAnchors.get('blockquotes-and-horizontal-rule')).toBe('blockquotes_and_horizontal_rule');
    expect(result.xml).toContain('w:name="blockquotes_and_horizontal_rule"');
    expect(result.xml).toMatch(/<w:hyperlink\s+w:anchor="blockquotes_and_horizontal_rule"\s+w:history="1">/);
  });

  it('removes fragment relationships that were converted to bookmarks', () => {
    const relationshipsXml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="#headings" TargetMode="External"/>',
      '  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>',
      '</Relationships>',
    ].join('');
    const relationships = collectInternalFragmentRelationships(relationshipsXml);

    const result = stripInternalFragmentRelationships(relationshipsXml, relationships, new Set(['headings']));

    expect(result).not.toContain('Target="#headings"');
    expect(result).toContain('Target="https://example.com"');
  });
});
