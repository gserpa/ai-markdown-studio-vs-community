import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionRoot = path.join(__dirname, '..', '..');

describe('presentation skill profiles', () => {
  it('registers the tool-first Copilot skill with VS Code', () => {
    const manifest = JSON.parse(readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
    const skill = readSkill('markdown-ai-studio-presentation-copilot');

    expect(manifest.contributes.chatSkills).toContainEqual({
      path: './skills/markdown-ai-studio-presentation-copilot/SKILL.md',
    });
    expect(skill).toContain('disable-model-invocation: true');
    expect(skill).toContain('#markdownPresentationPrompt');
    expect(skill).toContain('#validateMarkdownPresentation');
    expect(skill).toContain('#saveMarkdownStudioFile');
  });

  it('keeps the portable skill self-contained for Claude and Codex', () => {
    const skill = readSkill('markdown-ai-studio-presentation');

    expect(skill).not.toContain('disable-model-invocation: true');
    expect(skill).toContain('document: presentation');
    expect(skill).toContain('<!--slide: name-->');
    expect(skill).toContain('<!--notes: ...-->');
    expect(skill).toContain('every separator-delimited unit counts as one slide');
    expect(skill).toContain('Never correct count by deleting only a separator, directive, or title');
    expect(skill).toContain('do not claim visual rendering QA');
    expect(skill).toContain('browser-tool safety rejection');
    expect(skill).not.toContain('argument-hint:');
    expect(skill).not.toContain('#markdownPresentationPrompt');
  });
});

function readSkill(skillName: string): string {
  return readFileSync(path.join(extensionRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
}
