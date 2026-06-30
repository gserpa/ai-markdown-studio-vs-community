import { describe, expect, it } from 'vitest';
import { createDocumentPrompt, createPresentationPrompt } from '../src/generationPrompts';

describe('generation prompt builders', () => {
  it('builds a self-contained document prompt', () => {
    const prompt = createDocumentPrompt({
      brief: 'Write a project update',
      audience: 'Steering committee',
      tone: 'Executive',
      length: 'Standard',
      documentTheme: 'modern-blue',
    });

    expect(prompt).toContain('Create a complete .md file for the requested document.');
    expect(prompt).toContain('Start with YAML front matter containing filename and theme only.');
    expect(prompt).toContain('Use theme: modern-blue.');
    expect(prompt).toContain('Brief: Write a project update');
    expect(prompt).not.toContain('Prompt copied.');
  });

  it('builds a presentation prompt with quality guidance', () => {
    const prompt = createPresentationPrompt({
      brief: 'Explain the target architecture',
      audience: 'Architecture review board',
      tone: 'Technical',
      length: '9 slides',
      presentationTheme: 'galaxy',
      presentationRatio: '16:9',
      allowRemoteResources: true,
    });

    expect(prompt).toContain('Create a complete .md file for the requested presentation deck.');
    expect(prompt).toContain('place exactly one <!--slide: name--> comment immediately after the top-level --- separator and before the title');
    expect(prompt).toContain('Avoid the pattern where every slide has exactly three bullets.');
    expect(prompt).toContain('roughly 8-10 short lines');
    expect(prompt).toContain('Choose each slide layout deliberately');
    expect(prompt).toContain('Use image-right for naturally visual concepts');
    expect(prompt).toContain('Use two-columns only for real comparisons');
    expect(prompt).toContain('Every content slide must include a concise <!--notes: ...-->');
    expect(prompt).toContain('use Google Images or a similar image search');
    expect(prompt).toContain('Remote image embeds are allowed in this workspace');
    expect(prompt).toContain('embed the remote image in the Markdown slide content');
  });

  it('builds a presentation prompt that blocks remote embeds when disabled', () => {
    const prompt = createPresentationPrompt({
      brief: 'Explain the target architecture',
      audience: 'Architecture review board',
      tone: 'Technical',
      length: '9 slides',
      presentationTheme: 'galaxy',
      presentationRatio: '16:9',
      allowRemoteResources: false,
    });

    expect(prompt).toContain('Remote image embeds are NOT allowed in this workspace');
    expect(prompt).toContain('Do not embed remote image URLs in the Markdown');
    expect(prompt).toContain('Use speaker-note or blockquote image suggestions instead');
  });
});
