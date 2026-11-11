import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';
import { bundledComponents } from '@mfo/bundled-components';
import { createMarkdownRenderer } from '../src/render/markdownRenderer';
import { getMpsCompletions, validateMpsSource } from '../src/presentation/mpsLanguageService';
import { formatMarkdownTables } from '../src/format/markdownTableFormatter';
import { getComponentPptxWarnings, prepareComponentsForPptx } from '../src/components/components';

describe('generic bundled component integration', () => {
  it('keeps bundled component names out of platform implementation and shared styles', () => {
    const workspace = path.resolve(__dirname, '../../..');
    const roots = ['packages/md-core/src', 'packages/md-preview-web/src', 'packages/md-preview-web/styles', 'packages/ai-core/src'];
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : /\.(ts|mts|css)$/u.test(entry.name) ? [full] : [];
    });
    for (const file of roots.flatMap(root => walk(path.join(workspace, root)))) {
      const content = fs.readFileSync(file, 'utf8');
      for (const component of bundledComponents) expect(content, file).not.toContain(component.type);
    }
  });

  it('supports another component through the same rendering, authoring, formatting and export hooks', () => {
    bundledComponents.push({
      type: 'sample', version: 1,
      completion: { label: 'sample', detail: 'Insert a sample.', insertText: '~~~component\ntype: sample\n~~~' },
      parse: (data: any) => { if (typeof data?.text !== 'string') throw new Error('Sample needs text.'); return data.text; },
      render: (value: string) => `<p class="sample-component">${value}</p>`,
      formatTables: (source, validate) => validate('type: sample\nversion: 1\ndata: { text: Hello }\n') ? source.replace('unformatted', 'formatted') : source,
      preparePptx: document => { document.querySelector('.sample-component')?.setAttribute('data-exported', 'yes'); },
      pptxWarning: () => 'Sample export is simplified.',
    });
    try {
      const definition = 'type: sample\nversion: 1\ndata: { text: Hello }\n';
      const body = '~~~component\n' + definition + '~~~';
      const dom = new JSDOM(createMarkdownRenderer().render(body));
      expect(dom.window.document.querySelector('.sample-component')?.textContent).toBe('Hello');
      prepareComponentsForPptx(dom.window.document);
      expect(dom.window.document.querySelector('.sample-component')?.getAttribute('data-exported')).toBe('yes');
      expect(getComponentPptxWarnings(body)).toContain('Component: Sample export is simplified.');
      expect(formatMarkdownTables('unformatted')).toBe('formatted');
      const header = '---\ndocument: presentation\n---\n\n';
      expect(getMpsCompletions(header, header.length).map(x => x.label)).toContain('sample');
      expect(validateMpsSource(header + body).filter(x => x.code === 'invalid-component')).toEqual([]);
      expect(validateMpsSource(header + body.replace('text: Hello', 'text: 1')).some(x => x.message.includes('Sample needs text'))).toBe(true);
    } finally { bundledComponents.pop(); }
  });
});
