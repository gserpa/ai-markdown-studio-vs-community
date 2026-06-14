import { describe, expect, it } from 'vitest';
import { createDocumentPrompt, createPresentationPrompt } from '../../src/ai/presentationGenerationPrompts';

describe('Community generation prompts', () => {
  it('builds a standard Markdown document prompt', () => {
    const prompt = createDocumentPrompt({
      brief: 'Write a launch memo',
      audience: 'Product leadership',
      tone: 'Executive',
      length: 'Short',
      theme: 'auto',
    });
    expect(prompt).toContain('complete Markdown document');
    expect(prompt).toContain('Do not set document: presentation');
    expect(prompt).toContain('Brief: Write a launch memo');
  });

  it('builds a valid MPS-oriented presentation prompt', () => {
    const prompt = createPresentationPrompt({
      brief: 'Present the architecture',
      audience: 'Architecture review board',
      tone: 'Technical',
      slideCount: 9,
      theme: 'galaxy',
      ratio: '16:9',
    });
    expect(prompt).toContain('document: presentation');
    expect(prompt).toContain('approximately 9 slides');
    expect(prompt).toContain('Use ratio: 16:9');
  });
});
