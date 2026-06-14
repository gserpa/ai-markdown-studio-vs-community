import { validateMarkdownStudioPresentation } from '@mfo/ai-core';

export function validatePresentation(markdown: string): string[] {
  return validateMarkdownStudioPresentation(markdown).issues;
}
