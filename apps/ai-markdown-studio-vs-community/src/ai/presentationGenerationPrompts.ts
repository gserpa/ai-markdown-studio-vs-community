export type PresentationGenerationRequest = {
  brief: string;
  audience: string;
  tone: string;
  slideCount: number;
  theme: string;
  ratio: '16:9' | '4:3';
};

export type DocumentGenerationRequest = {
  brief: string;
  audience: string;
  tone: string;
  length: string;
  theme: string;
};

export function createDocumentPrompt(request: DocumentGenerationRequest): string {
  return [
    'Create a complete Markdown document for AI Markdown Studio.',
    'Return raw Markdown only, without a code fence.',
    'Start with YAML front matter containing filename and theme. Do not set document: presentation.',
    `Use theme: ${request.theme}.`,
    'Use CommonMark and GitHub-Flavored Markdown.',
    'Use clear headings, lists, tables, blockquotes, and fenced code blocks when they improve the document.',
    'Do not invent citations or external facts. Mark facts requiring verification as notes for the user.',
    '',
    `Brief: ${request.brief}`,
    `Audience: ${request.audience}`,
    `Tone: ${request.tone}`,
    `Length: ${request.length}`,
  ].join('\n');
}

export function createPresentationPrompt(request: PresentationGenerationRequest): string {
  return [
    'Create a complete Markdown Presentation Specification deck for AI Markdown Studio.',
    'Return raw Markdown only, without a code fence.',
    'Start with YAML front matter containing filename, document: presentation, title, theme, and ratio.',
    `Use theme: ${request.theme}.`,
    `Use ratio: ${request.ratio}.`,
    `Create approximately ${request.slideCount} slides.`,
    'Separate slides with top-level --- separators.',
    'Every slide must have one # H1 title and a concise <!--notes: ...--> speaker note.',
    'Allowed slide directives are cover, default, two-columns, image-right, divider, section-divider, table, table-legend, and thanks.',
    'Place a slide directive immediately before its H1 title. Use two-columns only with ## H2 column headings.',
    'Vary content forms intentionally and keep every slide concise enough to preview and export cleanly.',
    'Do not invent citations, local image paths, or remote image URLs.',
    '',
    `Brief: ${request.brief}`,
    `Audience: ${request.audience}`,
    `Tone: ${request.tone}`,
  ].join('\n');
}

export function createPresentationRepairPrompt(markdown: string, issues: string[]): string {
  return [
    'Repair this Markdown Presentation Specification deck.',
    'Return raw Markdown only, without a code fence. Preserve the intended content.',
    'Ensure front matter includes document: presentation, slides use top-level --- separators, every slide has one # H1 title, and content slides have speaker notes.',
    '',
    'Issues:',
    ...issues.map((issue) => `- ${issue}`),
    '',
    markdown,
  ].join('\n');
}
