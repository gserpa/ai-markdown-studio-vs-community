import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const previewStylesheet = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.css'),
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
});
