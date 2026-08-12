import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const previewStylesheet = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.css'),
  'utf8',
);
const previewScript = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.js'),
  'utf8',
);

function extractSection(startMarker: string, endMarker: string): string {
  const startIndex = previewStylesheet.indexOf(startMarker);
  const endIndex = previewStylesheet.indexOf(endMarker, startIndex + startMarker.length);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not locate stylesheet section between "${startMarker}" and "${endMarker}".`);
  }

  return previewStylesheet.slice(startIndex, endIndex);
}

describe('preview stylesheet presentation panels', () => {
  it('keeps bottom-panel scrollbars on presentation theme variables', () => {
    const panelSection = extractSection(
      '.presentation-bottom-panel {',
      '.presentation-bottom-panel[hidden] {',
    );

    expect(panelSection).toContain('scrollbar-width: thin;');
    expect(panelSection).toContain('scrollbar-color:');
    expect(panelSection).toContain('--presentation-body-color');
    expect(panelSection).toContain('--presentation-panel-bg-soft');
    expect(panelSection).not.toContain('--vscode-editor-background');
    expect(panelSection).not.toContain('--vscode-editor-foreground');
  });

  it('keeps presentation headings and bold table cells on the presentation body palette', () => {
    expect(previewStylesheet).toContain(`.presentation-slide-body blockquote {
  color: var(--presentation-emphasis-color, var(--presentation-body-color, inherit));
}`);
    expect(previewStylesheet).toContain(`.presentation-slide-body h2,
.presentation-slide-body h3,
.presentation-slide-body h4 {
  color: var(--presentation-body-color, inherit);
}`);
    expect(previewStylesheet).toContain(`.presentation-slide-body td strong {
  color: inherit;
}`);
  });

  it('provides a transform-safe wrapper for scaling overflowing presentation content', () => {
    expect(previewStylesheet).toContain(`.presentation-content-fit {
  box-sizing: border-box;
  width: var(--presentation-content-fit-width, 100%);
  height: var(--presentation-content-fit-height, 100%);
  min-width: 0;
  min-height: 0;
  transform: scale(var(--presentation-content-scale, 1));
  transform-origin: top left;
}`);
  });

  it('keeps long code local and finds the largest fitting slide scale down to 60%', () => {
    expect(previewStylesheet).toContain(`.presentation-slide-body pre {
  font-size: calc(0.96em * var(--presentation-code-scale, 1));
}`);
    expect(previewScript).toContain('const presentationContentFitMinimumScale = 0.6;');
    expect(previewScript).toContain('function findLargestPresentationContentScale(contentFit) {');
    expect(previewScript).toContain('function fitPresentationCodeBlocks(contentFit) {');
  });

  it('uses border-box sizing for padded divider layouts before measuring slide overflow', () => {
    expect(previewStylesheet).toContain(`.presentation-divider-layout {
  box-sizing: border-box;`);
    expect(previewStylesheet).toContain(`.presentation-divider-b-layout {
  box-sizing: border-box;`);
  });
});
