const CLIPBOARD_TO_MARKDOWN_PROMPT = [
  'Convert the supplied clipboard content into faithful Markdown with minimal structure changes.',
  'Preserve the original content, order, and wording as literally as possible.',
  'Do not summarize, paraphrase, normalize, or invent content.',
  'Use Markdown structure only where it reflects the source content, such as headings, lists, tables, blockquotes, and fenced code blocks.',
  'If the input is already Markdown, keep it structurally faithful and make only minor formatting cleanup.',
  'Return raw Markdown only, without a code fence around the complete response.',
  'Start the file with YAML front matter containing only a filename field when a filename can be inferred from the content.',
  'Choose a concise descriptive filename in Title Case and end it with .md.',
].join('\n');

export function buildClipboardMarkdownPrompt(text: string): string {
  return `${CLIPBOARD_TO_MARKDOWN_PROMPT}\n\n---\n\n${text}`;
}

export function extractMarkdownFilename(markdown: string): string | undefined {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith('---')) return undefined;

  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex < 0) return undefined;

  const frontMatter = trimmed.substring(0, endIndex);
  const match = /^\s*filename\s*:\s*(.+)\s*$/imu.exec(frontMatter);
  if (!match) return undefined;

  const raw = match[1]
    .trim()
    .trim();

  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim() || undefined;
  }

  return raw || undefined;
}