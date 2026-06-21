import { describe, expect, it } from 'vitest';
import { buildClipboardMarkdownPrompt, extractMarkdownFilename } from '../../src/ai/clipboardMarkdown';

describe('clipboardMarkdown', () => {
  it('asks for faithful markdown with a filename front matter hint', () => {
    const prompt = buildClipboardMarkdownPrompt('# Heading\n\nBody text.');

    expect(prompt).toContain('faithful Markdown with minimal structure changes');
    expect(prompt).toContain('Preserve the original content, order, and wording as literally as possible.');
    expect(prompt).toContain('Start the file with YAML front matter containing only a filename field');
  });

  it('extracts a filename from returned front matter', () => {
    const filename = extractMarkdownFilename(`---
filename: Quarterly Review.md
---

# Title
`);

    expect(filename).toBe('Quarterly Review.md');
  });

  it('returns undefined when no filename is present', () => {
    expect(extractMarkdownFilename(`---
theme: auto
---

# Title
`)).toBeUndefined();
  });
});