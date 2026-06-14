import * as fs from 'node:fs';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const runtimeScript = fs.readFileSync(
  path.resolve(__dirname, '..', 'assets', 'preview-theme-runtime.js'),
  'utf8',
);

type PreviewThemeRuntime = {
  resolvePreviewThemeState: (options: {
    previewMode: 'document' | 'presentation';
    body: HTMLElement;
    previewRoot?: HTMLElement;
  }) => {
    previewMode: 'document' | 'presentation';
    themeMode?: 'dark' | 'light' | 'auto';
    mermaidTheme: string;
    isMermaidDark: boolean;
    mermaidTransparentBackground: boolean;
  };
};

function createRuntimeDom(bodyAttributes = '', bodyClasses = '') {
  const dom = new JSDOM(`<!DOCTYPE html><html><body class="${bodyClasses}" ${bodyAttributes}></body></html>`, {
    runScripts: 'dangerously',
  });

  dom.window.eval(runtimeScript);
  return dom;
}

function getRuntime(dom: JSDOM): PreviewThemeRuntime {
  return (dom.window as unknown as { __mfoPreviewThemeRuntime: PreviewThemeRuntime }).__mfoPreviewThemeRuntime;
}

describe('previewThemeRuntime', () => {
  it('keeps a pinned light document theme light on a dark host', () => {
    const dom = createRuntimeDom(
      'data-document-theme-mode="light" data-document-mermaid-theme-light="default" data-document-mermaid-theme-dark="dark"',
      'vscode-dark',
    );
    const runtime = getRuntime(dom);

    const state = runtime.resolvePreviewThemeState({
      previewMode: 'document',
      body: dom.window.document.body,
    });

    expect(state.themeMode).toBe('light');
    expect(state.mermaidTheme).toBe('default');
    expect(state.isMermaidDark).toBe(false);
  });

  it('keeps a pinned dark document theme dark on a light host', () => {
    const dom = createRuntimeDom(
      'data-document-theme-mode="dark" data-document-mermaid-theme-light="default" data-document-mermaid-theme-dark="dark" data-document-mermaid-transparent-background-dark="true"',
      'vscode-light',
    );
    const runtime = getRuntime(dom);

    const state = runtime.resolvePreviewThemeState({
      previewMode: 'document',
      body: dom.window.document.body,
    });

    expect(state.themeMode).toBe('dark');
    expect(state.mermaidTheme).toBe('dark');
    expect(state.isMermaidDark).toBe(true);
    expect(state.mermaidTransparentBackground).toBe(true);
  });

  it('uses host mode for auto document themes', () => {
    const darkDom = createRuntimeDom(
      'data-document-theme-mode="auto" data-document-mermaid-theme-light="default" data-document-mermaid-theme-dark="dark"',
      'vscode-dark',
    );
    const lightDom = createRuntimeDom(
      'data-document-theme-mode="auto" data-document-mermaid-theme-light="default" data-document-mermaid-theme-dark="dark"',
      'vscode-light',
    );

    const darkState = getRuntime(darkDom).resolvePreviewThemeState({
      previewMode: 'document',
      body: darkDom.window.document.body,
    });
    const lightState = getRuntime(lightDom).resolvePreviewThemeState({
      previewMode: 'document',
      body: lightDom.window.document.body,
    });

    expect(darkState.themeMode).toBe('auto');
    expect(darkState.mermaidTheme).toBe('dark');
    expect(darkState.isMermaidDark).toBe(true);
    expect(lightState.themeMode).toBe('auto');
    expect(lightState.mermaidTheme).toBe('default');
    expect(lightState.isMermaidDark).toBe(false);
  });

  it('uses the selected explicit presentation Mermaid theme even when it differs from the host', () => {
    const lightHostDom = createRuntimeDom('', 'vscode-light');
    const lightHostRuntime = getRuntime(lightHostDom);
    const darkThemeRoot = lightHostDom.window.document.createElement('section');
    darkThemeRoot.dataset.presentationMermaidThemeLight = 'dark';
    darkThemeRoot.dataset.presentationMermaidThemeDark = 'dark';
    darkThemeRoot.dataset.presentationMermaidTransparentBackgroundLight = 'true';

    const darkThemeState = lightHostRuntime.resolvePreviewThemeState({
      previewMode: 'presentation',
      body: lightHostDom.window.document.body,
      previewRoot: darkThemeRoot,
    });

    expect(darkThemeState.mermaidTheme).toBe('dark');
    expect(darkThemeState.isMermaidDark).toBe(true);
    expect(darkThemeState.mermaidTransparentBackground).toBe(true);

    const dom = createRuntimeDom('', 'vscode-dark');
    const runtime = getRuntime(dom);
    const previewRoot = dom.window.document.createElement('section');
    previewRoot.dataset.presentationMermaidThemeLight = 'forest';
    previewRoot.dataset.presentationMermaidThemeDark = 'forest';
    previewRoot.dataset.presentationMermaidTransparentBackgroundDark = 'true';

    const state = runtime.resolvePreviewThemeState({
      previewMode: 'presentation',
      body: dom.window.document.body,
      previewRoot,
    });

    expect(state.mermaidTheme).toBe('forest');
    expect(state.isMermaidDark).toBe(false);
    expect(state.mermaidTransparentBackground).toBe(true);
  });
});
