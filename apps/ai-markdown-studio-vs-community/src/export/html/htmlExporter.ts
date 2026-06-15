import { readFile, writeFile } from 'node:fs/promises';
import { createMarkdownRenderer, sanitizeRenderedHtml, stripMarkdownFrontMatter } from '@mfo/core';
import { resolveDocumentResource } from '../../util/documentResourceResolver';
import { resolveExtensionAssetUri, resolveExtensionNodeModulesUri } from '../../util/extensionSupportRoot';
import * as path from 'path';
import * as vscode from 'vscode';


export async function buildExportHtmlString(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<string> {
  const [previewCss, katexCss, mermaidScript] = await Promise.all([
    readFile(resolveExtensionAssetUri(extensionUri, 'preview', 'preview.css').fsPath, 'utf8'),
    readFile(resolveExtensionNodeModulesUri(extensionUri, 'katex', 'dist', 'katex.min.css').fsPath, 'utf8'),
    readFile(resolveExtensionNodeModulesUri(extensionUri, 'mermaid', 'dist', 'mermaid.min.js').fsPath, 'utf8'),
  ]);

  const allowRemoteResources = vscode.workspace.getConfiguration('markdownAiStudio', document.uri).get<boolean>('allowRemoteResources', true);
  const renderer = createMarkdownRenderer({
    resolveImageSrc: (rawPath) => {
      if (/^https?:/i.test(rawPath)) {
        return allowRemoteResources ? rawPath : null;
      }

      return resolveDocumentResource(document, rawPath)?.toString();
    },
    rewriteLink: (href) => {
      if (/^https?:/i.test(href) || href.startsWith('#')) {
        return /^https?:/i.test(href)
          ? {
              attributes: {
                target: '_blank',
                rel: 'noopener noreferrer',
              },
            }
          : undefined;
      }

      return {
        href: resolveDocumentResource(document, href)?.toString() ?? href,
      };
    },
  });

  const body = sanitizeRenderedHtml(renderer.render(stripMarkdownFrontMatter(document.getText())));
  return buildStandaloneHtml({
    title: path.basename(document.fileName),
    body,
    previewCss,
    katexCss: rewriteKatexCssUrls(katexCss),
    mermaidScript,
  });
}

export async function exportMarkdownAsHtml(extensionUri: vscode.Uri, document: vscode.TextDocument): Promise<vscode.Uri | undefined> {
  const defaultTarget = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `${path.parse(document.fileName).name}.html`));
  const targetUri = await vscode.window.showSaveDialog({
    defaultUri: defaultTarget,
    filters: {
      HTML: ['html'],
    },
    saveLabel: 'Export HTML',
  });

  if (!targetUri) {
    return undefined;
  }

  const html = await buildExportHtmlString(extensionUri, document);
  await writeFile(targetUri.fsPath, html, 'utf8');
  return targetUri;
}

function rewriteKatexCssUrls(css: string): string {
  return css.replace(/url\((?:\.\/)?fonts\//gu, 'url(https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/fonts/');
}

function buildStandaloneHtml(input: {
  title: string;
  body: string;
  previewCss: string;
  katexCss: string;
  mermaidScript: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <style>
${getExportThemeCss()}
  </style>
  <style>
${input.katexCss}
  </style>
  <style>
${input.previewCss}
  </style>
</head>
<body>
  <main class="markdown-body">${input.body}</main>
  <script>
${getThemeBootstrapScript()}
  </script>
  <script>
${input.mermaidScript}
  </script>
  <script>
${getMermaidBootstrapScript()}
  </script>
</body>
</html>`;
}

function getExportThemeCss(): string {
  return `
:root {
  color-scheme: light dark;
  --vscode-editor-foreground: #24292f;
  --vscode-editor-background: #ffffff;
  --vscode-panel-border: #d0d7de;
  --vscode-descriptionForeground: #57606a;
  --vscode-textBlockQuote-border: #d0d7de;
  --vscode-textLink-foreground: #0969da;
  --vscode-textLink-activeForeground: #1a7f37;
  --vscode-focusBorder: #0969da;
  --vscode-editorHoverWidget-background: #f6f8fa;
  --vscode-foreground: #24292f;
}

html.vscode-dark {
  --vscode-editor-foreground: #c9d1d9;
  --vscode-editor-background: #0d1117;
  --vscode-panel-border: #30363d;
  --vscode-descriptionForeground: #8b949e;
  --vscode-textBlockQuote-border: #3d444d;
  --vscode-textLink-foreground: #58a6ff;
  --vscode-textLink-activeForeground: #79c0ff;
  --vscode-focusBorder: #2f81f7;
  --vscode-editorHoverWidget-background: #161b22;
  --vscode-foreground: #c9d1d9;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--vscode-editor-background);
}
`;
}

function getThemeBootstrapScript(): string {
  return `(() => {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => {
    document.documentElement.classList.toggle('vscode-dark', darkModeQuery.matches);
  };

  applyTheme();
  if (typeof darkModeQuery.addEventListener === 'function') {
    darkModeQuery.addEventListener('change', applyTheme);
  } else if (typeof darkModeQuery.addListener === 'function') {
    darkModeQuery.addListener(applyTheme);
  }
})();`;
}

function getMermaidBootstrapScript(): string {
  return `(() => {
  const isDark = document.documentElement.classList.contains('vscode-dark');
  if (!window.mermaid) {
    return;
  }

  window.mermaid.startOnLoad = false;

  window.mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: false,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
      padding: 10,
    },
  });

  const blocks = [...document.querySelectorAll('.mermaid')];
  for (const [index, block] of blocks.entries()) {
    const source = block.textContent?.trim();
    if (!source) {
      continue;
    }

    const renderId = 'export-mermaid-' + (index + 1);
    const renderResult = await window.mermaid.render(renderId, source);
    const svg = typeof renderResult === 'string' ? renderResult : renderResult?.svg;
    if (typeof svg === 'string' && svg.trim()) {
      block.innerHTML = svg;
      block.classList.remove('mermaid');
      block.classList.add('mermaid-rendered');
      block.setAttribute('data-mermaid-source', source);
    }

    if (typeof renderResult?.bindFunctions === 'function') {
      renderResult.bindFunctions(block);
    }
  }
})();`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
