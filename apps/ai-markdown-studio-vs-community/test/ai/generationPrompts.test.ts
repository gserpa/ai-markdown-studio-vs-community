import { describe, expect, it } from 'vitest';
import { createDocumentPrompt, createPresentationPrompt } from '@mfo/ai-core';

describe('Community generation prompts', () => {
  it('builds a standard Markdown document prompt', () => {
    const prompt = createDocumentPrompt({
      brief: 'Write a launch memo',
      audience: 'Product leadership',
      tone: 'Executive',
      length: 'Short',
      documentTheme: 'auto',
    });
    expect(prompt).toContain('Create a complete .md file');
    expect(prompt).toContain('Do not set document: presentation');
    expect(prompt).toContain('Brief: Write a launch memo');
  });

  it('builds a valid MPS-oriented presentation prompt', () => {
    const prompt = createPresentationPrompt({
      brief: 'Present the architecture',
      audience: 'Architecture review board',
      tone: 'Technical',
      length: '9 slides',
      presentationTheme: 'galaxy',
      presentationRatio: '16:9',
      allowRemoteResources: true,
    });
    expect(prompt).toContain('document: presentation');
    expect(prompt).toContain('9 slides');
    expect(prompt).toContain('Use ratio: 16:9');
    expect(prompt).toContain('Remote image embeds are allowed in this workspace');
  });
});
