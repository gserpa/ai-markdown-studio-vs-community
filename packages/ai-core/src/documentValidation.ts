export type DocumentValidationResult = {
  valid: boolean;
  summary: string;
  issues: string[];
};

export function validateMarkdownStudioDocument(markdown: string): DocumentValidationResult {
  const issues: string[] = [];
  const trimmed = markdown.trim();

  if (!trimmed) {
    issues.push('Markdown document content is required.');
  }

  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(trimmed)?.[1];
  if (!frontMatter) {
    issues.push('Markdown document should start with YAML front matter.');
  } else {
    if (/^document:\s*presentation\b/imu.test(frontMatter)) {
      issues.push('Markdown document must not set document: presentation.');
    }

    if (!/^filename:\s*\S/imu.test(frontMatter)) {
      issues.push('Markdown document front matter should include filename.');
    }

    if (!/^theme:\s*\S/imu.test(frontMatter)) {
      issues.push('Markdown document front matter should include theme.');
    }
  }

  if (!/^#\s+\S/mu.test(trimmed.replace(/^---[\s\S]*?\r?\n---\r?\n/u, ''))) {
    issues.push('Markdown document should include one # H1 title.');
  }

  const uniqueIssues = [...new Set(issues)];
  return {
    valid: uniqueIssues.length === 0,
    summary: uniqueIssues.length === 0
      ? 'Markdown document is structurally ready for Markdown AI Studio preview.'
      : `Markdown document has ${uniqueIssues.length} issue${uniqueIssues.length === 1 ? '' : 's'} to fix.`,
    issues: uniqueIssues,
  };
}
