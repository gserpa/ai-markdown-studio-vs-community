import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const canonicalPreviewRuntime = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview.js'),
  'utf8',
);

const syncedPreviewRuntime = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'assets', 'preview', 'preview.js'),
  'utf8',
);

describe('preview Mermaid links', () => {
  it('keeps Mermaid URL links usable while stripping callback handlers in strict mode', () => {
    expect(canonicalPreviewRuntime).toContain("suppressErrorRendering: true");
    expect(canonicalPreviewRuntime).toContain('const renderId = `preview-mermaid-${index + 1}`;');
    expect(canonicalPreviewRuntime).toContain('function getAnchorLinkTarget(anchor)');
    expect(canonicalPreviewRuntime).toContain('function isMermaidLink(anchor)');
    expect(canonicalPreviewRuntime).toContain("const href = anchor?.getAttribute('data-href')?.trim()");
    expect(canonicalPreviewRuntime).toContain("|| getAnchorLinkTarget(anchor)");
    expect(canonicalPreviewRuntime).toContain("for (const element of block.querySelectorAll('[onclick]'))");
    expect(canonicalPreviewRuntime).toContain('const linkTarget = getAnchorLinkTarget(anchor)');
    expect(canonicalPreviewRuntime).toContain("anchor.setAttribute('data-href', linkTarget)");
    expect(canonicalPreviewRuntime).toContain("anchor.removeAttribute('href')");
    expect(canonicalPreviewRuntime).toContain("anchor.removeAttribute('xlink:href')");
    expect(canonicalPreviewRuntime).not.toContain("data-mermaid-link-disabled");
    expect(canonicalPreviewRuntime).not.toContain("renderResult.bindFunctions(block)");
    expect(canonicalPreviewRuntime).toContain("if (linkedHref.startsWith('#'))");
    expect(canonicalPreviewRuntime).toContain('scrollToPreviewFragment(linkedHref)');
    expect(canonicalPreviewRuntime).toContain('function scrollToPreviewFragment(href)');
    expect(canonicalPreviewRuntime).toContain('cleanupMermaidRenderArtifacts(renderId)');
    expect(canonicalPreviewRuntime).toContain('patchMermaidLabelContrast(block);');
    expect(canonicalPreviewRuntime).toContain('function getMermaidNodeLabelTargets(node)');
    expect(canonicalPreviewRuntime).toContain('function applyMermaidLabelColor(targets, color)');
  });

  it('repositions zoom buttons to stay within the viewport', () => {
    expect(canonicalPreviewRuntime).toContain('function positionMermaidZoomTrigger(trigger, block)');
    expect(canonicalPreviewRuntime).toContain('const availableOutsideWidth = viewportWidth - blockRect.right - viewportPadding');
    expect(canonicalPreviewRuntime).toContain("trigger.style.bottom = `calc(100% + ${outsideGap}px)`;");
    expect(canonicalPreviewRuntime).toContain("trigger.style.right = '0';");
    expect(canonicalPreviewRuntime).toContain('function repositionMermaidZoomTriggers()');
  });

  it('keeps the synced app runtime aligned with the canonical asset', () => {
    expect(syncedPreviewRuntime).toBe(canonicalPreviewRuntime);
  });
});
