export type GenerationPromptRequest = {
  brief: string;
  audience: string;
  tone: string;
  length: string;
  documentTheme?: string;
  presentationTheme?: string;
  presentationRatio?: '16:9' | '4:3';
  allowRemoteResources?: boolean;
};

export function createDocumentPrompt(request: GenerationPromptRequest): string {
  const theme = request.documentTheme ?? 'auto';

  return [
    'You are generating a Markdown document for Markdown AI Studio.',
    '',
    'Create a complete .md file for the requested document.',
    'If your environment can create files, create the Markdown file using the filename in the YAML front matter.',
    'If your environment cannot create files, return the complete raw Markdown file content only.',
    'Output raw Markdown only. Do not wrap the response in a code fence.',
    'Create a complete, useful document from the user brief. Use CommonMark and GitHub-Flavored Markdown.',
    'Use clear headings, lists, tables, blockquotes, and fenced code blocks only when they fit the content.',
    'Start with YAML front matter containing filename and theme only. Do not set document: presentation.',
    `Use theme: ${theme}.`,
    'Do not invent citations or external facts. If a fact would need verification, mark it as a note for the user to verify.',
    '',
    `Brief: ${request.brief}`,
    `Audience: ${request.audience}`,
    `Tone: ${request.tone}`,
    `Length: ${request.length}`,
  ].join('\n');
}

export function createPresentationPrompt(request: GenerationPromptRequest): string {
  const theme = request.presentationTheme ?? 'galaxy';
  const ratio = request.presentationRatio ?? '16:9';
  const allowRemoteResources = request.allowRemoteResources ?? true;

  return [
    'You are generating a Markdown Presentation Specification deck for Markdown AI Studio.',
    '',
    'Create a complete .md file for the requested presentation deck.',
    'If your environment can create files, create the Markdown file using the filename in the YAML front matter.',
    'If your environment cannot create files, return the complete raw Markdown file content only.',
    'Output raw Markdown only. Do not wrap the response in a code fence.',
    'The file must start with YAML front matter containing filename, document: presentation, title, theme, and ratio.',
    `Use theme: ${theme}.`,
    `Use ratio: ${ratio}.`,
    'Use top-level --- separators between slides.',
    'Every slide must start with one # H1 slide title. If you use a slide directive, place exactly one <!--slide: name--> comment immediately after the top-level --- separator and before the title; never place it after the title or later in the slide body.',
    'Allowed built-in slide directives: cover, default, two-columns, image-right, image-center, divider, section-divider, table, table-legend, thanks.',
    'For two-columns slides, use ## H2 headings to define the sections.',
    'Every content slide must include a concise <!--notes: ...--> speaker note with delivery guidance. Cover and thanks slides may use shorter notes.',
    'Do not use unsupported custom directives.',
    'If you show slide-directive syntax in a fenced code example, the example is allowed and must not be treated as an actual directive; never place a literal slide directive in visible slide content outside a fenced code block.',
    'Keep slides concise enough to preview and export cleanly.',
    '',
    'Quality guidance:',
    '- Avoid the pattern where every slide has exactly three bullets.',
    '- A content slide may use roughly 8-10 short lines when useful, but do not pad slides to hit that limit.',
    '- Vary the content form intentionally: short paragraphs, bullets, tables, blockquotes, Mermaid diagrams, and images.',
    '- Choose each slide layout deliberately based on the information on that slide.',
    '- Use default for large-width images or diagrams that should remain in the natural, left-aligned Markdown body sequence with surrounding text.',
    '- Use image-center for an image-centric or stronger message: it deliberately centers the text and wide media, with short context above and a concise takeaway below.',
    '- Use image-right only for narrower images or diagrams that can share the slide with substantive text in the left column.',
    '- Use two-columns only for real comparisons, trade-offs, before/after views, problem/solution pairs, or paired concepts.',
    '- Use table or table-legend when the slide is primarily structured data, a roadmap, a feature matrix, or a comparison grid.',
    '- Use divider or section-divider only for major section breaks.',
    '- Internally plan the slide sequence, slide purpose, best layout, visual opportunity, and speaker-note intent before writing the final Markdown. Do not output that plan.',
    '',
    'Markdown AI Studio presentation context:',
    '- Front matter must contain document: presentation for slide preview and PPTX export.',
    '- Slide directives must appear immediately after the slide separator, before the # H1 title, and only once per slide.',
    '- default slides render text and large images or diagrams in their natural, left-aligned Markdown sequence.',
    '- image-right slides place the first narrow image or Mermaid diagram in the right media panel beside left-column text.',
    '- image-center slides center the text and first wide image or Mermaid diagram between the body text and footer text for an image-led message.',
    '- two-columns slides split content using ## H2 section headings.',
    '- speaker notes are HTML comments like <!--notes: Talk track here.--> and are not visible on the slide.',
    '',
    'Valid example:',
    '---',
    'filename: Mythical Figures (presentation).md',
    'document: presentation',
    'title: Mythical Figures',
    `theme: ${theme}`,
    `ratio: ${ratio}`,
    '---',
    '',
    '<!--slide: cover-->',
    '# Mythical Figures',
    '',
    'A tour through enduring symbols and stories.',
    '',
    '<!--notes: Set the mood and explain why myths remain useful cultural shorthand.-->',
    '',
    '---',
    '',
    '<!--slide: image-right-->',
    '# Athena as Strategy',
    '',
    'Athena represents wisdom under pressure: a figure of planning, craft, and disciplined courage.',
    '',
    '- Strategic intelligence rather than brute force',
    '- Practical invention and civic order',
    '- A visual shorthand for calm judgment in conflict',
    '',
    '![Athena statue](https://example.com/direct-athena-image.jpg)',
    '',
    '<!--notes: Explain why this slide uses image-right: the figure is visually recognizable, and the image anchors the abstract strategic theme.-->',
    '',
    '---',
    '',
    '<!--slide: two-columns-->',
    '# Why Myths Endure',
    '',
    '## Memory',
    '- They compress complex lessons into memorable characters.',
    '- Their images and names travel more easily than abstract principles.',
    '',
    '## Identity',
    '- They give communities shared references.',
    '- They make values feel embodied rather than merely stated.',
    '',
    '<!--notes: Contrast practical memory aids with emotional identity. Do not treat these as generic bullet buckets; each column has a clear role.-->',
    '',
    '---',
    '',
    '<!--slide: table-->',
    '# Recurring Narrative Roles',
    '',
    '| Role | Function | Example cue |',
    '| --- | --- | --- |',
    '| Trickster | Disrupts stale order | clever reversal |',
    '| Guardian | Protects a boundary | threshold or test |',
    '| Hero | Converts danger into identity | ordeal and return |',
    '',
    '<!--notes: Use this as a fast taxonomy slide. Keep the table compact and explain one row verbally.-->',
    '',
    presentationImageInstruction(allowRemoteResources),
    '',
    `Brief: ${request.brief}`,
    `Audience: ${request.audience}`,
    `Tone: ${request.tone}`,
    `Target length: ${request.length}`,
    `Theme: ${theme}`,
    `Ratio: ${ratio}`,
  ].join('\n');
}

export function createPresentationRepairPrompt(markdown: string, errors: string[]): string {
  return [
    'Repair this Markdown Presentation Specification file for Markdown AI Studio.',
    '',
    'Return raw Markdown only. Do not wrap the response in a code fence.',
    'Preserve the intended content, but fix structural errors.',
    'Required rules:',
    '- top-level front matter includes document: presentation',
    '- top-level --- separators divide slides',
    '- slide directives appear only once per slide, immediately after the slide separator and before the # H1 title',
    '- every slide has one # H1 title',
    '- content slides include concise <!--notes: ...--> speaker notes',
    '- use only built-in templates unless the content can use no directive',
    '- do not invent remote image URLs',
    '- if a remote image URL is not verified as a direct image resource, replace it with an image suggestion instead of leaving a broken image embed',
    '',
    'Validation errors:',
    ...errors.map((error) => `- ${error}`),
    '',
    'Markdown to repair:',
    markdown,
  ].join('\n');
}

export function presentationImageInstruction(allowRemoteResources: boolean): string {
  const policyLine = allowRemoteResources
    ? '- Remote image embeds are allowed in this workspace. When a slide clearly benefits from an image and you have a valid direct image URL, embed the remote image in the Markdown slide content instead of downgrading it to a suggestion.'
    : '- Remote image embeds are NOT allowed in this workspace. Do not embed remote image URLs in the Markdown. Use speaker-note or blockquote image suggestions instead unless the user already provided a local image path.';

  return [
    'Image handling:',
    policyLine,
    '- You may insert Markdown image links for direct image resources when they are relevant to the slide.',
    '- When you need an image and browsing or image search is available, use Google Images or a similar image search to discover a suitable picture, then use the original direct image URL as the Markdown image target.',
    '- Treat remote image verification as mandatory, not optional. Before using a remote image URL, confirm that it resolves successfully and serves the image itself, ideally with an HTTP 200 response and an image/* content type.',
    '- The final Markdown image target must be a direct image resource whose path ends in a real image extension such as .png, .jpg, .jpeg, .gif, .webp, .svg, or .avif, or otherwise resolves with an image/* content type.',
    '- Do not use Google Images result pages, google.com/imgres links, thumbnail/cache URLs, Wikipedia article pages, or guessed Wikimedia file paths as Markdown image targets.',
    '- Prefer stable origin image URLs such as the publisher CDN or raw image host. For Wikimedia, prefer the direct upload.wikimedia.org asset URL instead of a Wikipedia or Commons article page.',
    '- If a candidate image URL fails verification, returns a rate-limit response, or appears unstable, try another source or fall back to an image suggestion instead of guessing.',
    '- Be conservative about request cadence while searching for images: verify one candidate at a time, reuse successful URLs you already confirmed, and avoid repeatedly probing the same failing host.',
    '- If the brief provides a real local image path or URL, you may use image-right for the matching slide.',
    '- If remote image embeds are disallowed, or if you cannot find a valid direct image URL, add an image suggestion in speaker notes or a blockquote, for example: > Image suggestion: a classical depiction of Athena with owl and shield.',
    '- If you find only a useful source page and not a direct image URL, include it as a normal Markdown link inside the image suggestion, not as an image embed.',
    '- Never invent local placeholder paths; broken image placeholders are worse than no image.',
  ].join('\n');
}
