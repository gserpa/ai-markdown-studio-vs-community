/// <reference types="node" />

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const previewStylesheet = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.css'),
  'utf8',
).replace(/\r\n/g, '\n');
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

  it('uses a presentation-only wrapper for native table scrolling', () => {
    expect(previewStylesheet).toContain(`.presentation-slide-body table {
  font-size: 1rem;
}`);
    expect(previewStylesheet).toContain(`.presentation-table-scroll {
  max-width: 100%;
  margin: 0 0 8px;
  padding: 0;
  --md-preview-table-control-color: var(--presentation-table-header-color, var(--presentation-body-color, var(--presentation-contrast, #e5e7eb)));`);
    expect(previewStylesheet).toContain(`.presentation-table-scroll {
  max-width: 100%;`);
    expect(previewStylesheet).toContain(`overflow-x: auto;
  overflow-y: hidden;`);
    expect(previewStylesheet).toContain('scrollbar-width: thin;');
    expect(previewStylesheet).toContain('scrollbar-color: color-mix(in srgb, var(--presentation-body-color');
    expect(previewStylesheet).toContain('.presentation-table-scroll::-webkit-scrollbar-track {');
    expect(previewStylesheet).toContain('.presentation-table-scroll::-webkit-scrollbar-thumb {');
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-slide-body .table-scroll-wrapper.presentation-table-scroll::before,
body.preview-mode-presentation .presentation-slide-body .table-scroll-wrapper.presentation-table-scroll::after {
  display: none !important;
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-table-scroll .table-control-icon {
  color: var(--presentation-table-header-color, var(--presentation-body-color, var(--presentation-contrast, #e5e7eb)));
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-table-scroll .table-overlay-button {
  align-items: center;
  padding-top: 0;
  box-sizing: border-box;
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-table-scroll .table-edge-scroll-lane {
  position: sticky;
  top: var(--md-preview-table-header-height);
  height: var(--md-preview-table-edge-height);
  min-height: 42px;
  margin: 0 0 calc(-1 * var(--md-preview-table-edge-height));
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-table-scroll .table-overlay-lane {
  position: sticky;
  height: var(--md-preview-table-header-height);
  margin: 0 0 calc(-1 * var(--md-preview-table-header-height));
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-table-scroll .table-edge-scroll-button {
  height: 100%;
  min-height: 42px;
  color: var(--presentation-table-header-color, var(--presentation-body-color, var(--presentation-contrast, #e5e7eb)));
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-table-scroll .table-edge-scroll-button::before {
  display: block;
  background: var(--presentation-table-header-bg, var(--presentation-panel-bg-soft, transparent));
  opacity: 0.34;
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-table-scroll .table-edge-scroll-button:hover::before {
  opacity: 0.44;
}`);
    expect(previewStylesheet).toContain(`.presentation-table-scroll table {
  margin: 0;
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-slide-body .table-scroll-wrapper.presentation-table-scroll[data-table-layout='wrap'] {
  height: auto;
  min-height: 0;
  overflow: visible;
}`);
    expect(previewStylesheet).toContain(`body.preview-mode-presentation .presentation-slide-body .table-scroll-wrapper.presentation-table-scroll[data-table-layout='wrap'] table {
  display: table;
  height: auto;
}`);
    expect(previewScript).toContain('function wrapPresentationTablesForScroll() {');
    expect(previewScript).toContain('wrapPresentationTablesForScroll();');
    expect(previewScript).toContain("wrapper.className = 'table-scroll-wrapper presentation-table-scroll';");
    expect(previewScript).toContain("wrapper.dataset.tableLayout = 'wrap';");
    expect(previewScript).toContain("enhanceTableScrollWrapper(wrapper, 'wrap');");
    expect(previewScript).toContain("if (wrapper.closest('.presentation-slide-body')) {");
    expect(previewScript).toContain('window.requestAnimationFrame(() => {');
    expect(previewScript).toContain("window.dispatchEvent(new Event('resize'));");
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
    expect(previewStylesheet).toContain("body[data-presentation-content-overflow='scaleToFit'] .presentation-standard-content");
    expect(previewStylesheet).toContain("body[data-presentation-content-overflow='scaleToFit'] .presentation-slide-body pre {");
    expect(previewStylesheet).toContain(`.presentation-slide-body pre {
  font-size: calc(0.96em * var(--presentation-code-scale, 1));
}`);
    expect(previewScript).toContain('const presentationContentFitMinimumScale = 0.6;');
    expect(previewScript).toContain("'.presentation-thanks-note',");
    expect(previewScript).toContain("'.presentation-table-scroll',");
    expect(previewScript).toContain('target.clientWidth / target.scrollWidth');
    expect(previewScript).toContain('target.clientHeight / target.scrollHeight');
    expect(previewScript).toContain('header instanceof HTMLElement ? header.offsetHeight : 40');
    expect(previewScript).toContain('const tableHeight = table.offsetHeight;');
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
