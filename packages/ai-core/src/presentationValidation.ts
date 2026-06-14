import {
  createMpsDocumentSchema,
  parseMarkdownPresentation,
  validateMpsSource,
} from '@mfo/core';

export type PresentationValidationResult = {
  valid: boolean;
  summary: string;
  issues: string[];
  slideCount: number;
};

const KNOWN_PRESENTATION_THEMES = ['auto', 'default', 'galaxy', 'modern-blue', 'black'];

export function validateMarkdownStudioPresentation(markdown: string): PresentationValidationResult {
  const issues = validateMpsSource(markdown, createMpsDocumentSchema(KNOWN_PRESENTATION_THEMES))
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.message);

  let slideCount = 0;
  if (!/^---[\s\S]*?\ndocument:\s*presentation\b[\s\S]*?\n---/iu.test(markdown)) {
    issues.push('Front matter must include document: presentation.');
  }

  if (!/(?:^|\n)---\r?\n/u.test(markdown.replace(/^---[\s\S]*?\n---\r?\n/u, ''))) {
    issues.push('Presentation must contain top-level --- slide separators.');
  }

  try {
    const presentation = parseMarkdownPresentation(markdown);
    slideCount = presentation.slides.length;
    if (slideCount === 0) {
      issues.push('Presentation must contain at least one slide.');
    }

    for (const [index, slide] of presentation.slides.entries()) {
      if (!/^#\s+\S/mu.test(slide.body)) {
        issues.push(`Slide ${index + 1} must contain one # H1 slide title.`);
      }

      const directiveMatches = slide.body.match(/<!--\s*slide\s*:/giu) ?? [];
      if (directiveMatches.length > 1) {
        issues.push(`Slide ${index + 1} has more than one slide directive.`);
      }
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  const uniqueIssues = [...new Set(issues)];
  return {
    valid: uniqueIssues.length === 0,
    summary: uniqueIssues.length === 0
      ? `Presentation is structurally valid with ${slideCount} slide${slideCount === 1 ? '' : 's'}.`
      : `Presentation has ${uniqueIssues.length} issue${uniqueIssues.length === 1 ? '' : 's'} to fix.`,
    issues: uniqueIssues,
    slideCount,
  };
}
