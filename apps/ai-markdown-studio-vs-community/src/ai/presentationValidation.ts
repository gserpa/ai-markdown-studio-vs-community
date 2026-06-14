import { createMpsDocumentSchema, parseMarkdownPresentation, validateMpsSource } from '@mfo/core';

export function validatePresentation(markdown: string): string[] {
  const issues = validateMpsSource(
    markdown,
    createMpsDocumentSchema(['auto', 'default', 'galaxy', 'modern-blue', 'black']),
  )
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.message);

  try {
    const presentation = parseMarkdownPresentation(markdown);
    for (const [index, slide] of presentation.slides.entries()) {
      if (!/^#\s+\S/mu.test(slide.body)) {
        issues.push(`Slide ${index + 1} must contain one # H1 slide title.`);
      }
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  return [...new Set(issues)];
}
