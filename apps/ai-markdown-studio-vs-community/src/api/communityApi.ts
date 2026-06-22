import type { CommunityApiV1, ThemeSummary } from '@mfo/community-api';
import * as vscode from 'vscode';
import {
  createMarkdownRenderer,
  formatMarkdownTables,
  isMarkdownPresentationSource,
  parseMarkdownPresentation,
  resolveMarkdownPresentation,
  sanitizeRenderedHtml,
} from '@mfo/core';
import {
  loadDocumentThemeRegistryFromDirectories,
  loadPreviewThemeRegistryFromDirectories,
  renderPresentationPreview,
} from '@mfo/preview-web';
import { JSDOM } from 'jsdom';
import { resolveDocumentResource } from '../util/documentResourceResolver';
import { registerFeatureContribution, listFeatureContributions } from './featureContributions';
import { buildExportHtmlString } from '../export/html/htmlExporter';
import { assertAiFeaturesEnabled, ensureAiFeaturesEnabled, isAiAuthorizationDenied } from '../ai/aiConsent';
import { hasConfiguredCopilotAccount, refreshCopilotConfiguredContext } from '../ai/copilotAvailability';

export function createCommunityApi(extensionVersion: string, extensionUri: vscode.Uri, documentThemeDirectory: string, presentationThemeDirectory: string): CommunityApiV1 {
  const renderMarkdown = (markdown: string): string => sanitizeRenderedHtml(createMarkdownRenderer().render(markdown));

  return Object.freeze({
    apiVersion: '1.0',
    extensionVersion,
    rendering: Object.freeze({
      renderMarkdown: (markdown: string) => Object.freeze({ html: renderMarkdown(markdown) }),
      renderPresentation: (markdown: string) => {
        const presentation = toPlainRecord(resolveMarkdownPresentation(parseMarkdownPresentation(markdown)));
        const registry = loadPreviewThemeRegistryFromDirectories([presentationThemeDirectory]);
        const html = renderPresentationPreview(markdown, renderMarkdown, registry, (html) => new JSDOM(html).window.document).html;
        return Object.freeze({ html, presentation });
      },
      buildStandaloneHtml: (
        document: vscode.TextDocument,
        options?: { pdfBackgroundMode?: 'theme' | 'paper' },
      ) => buildExportHtmlString(extensionUri, document),
    }),
    parsing: Object.freeze({
      detectDocumentKind: (markdown: string) => isMarkdownPresentationSource(markdown) ? 'presentation' : 'document',
      parsePresentation: (markdown: string) => toPlainRecord(resolveMarkdownPresentation(parseMarkdownPresentation(markdown))),
    }),
    themes: Object.freeze({
      listDocumentThemes: () => listThemes(loadDocumentThemeRegistryFromDirectories([documentThemeDirectory])),
      listPresentationThemes: () => listThemes(loadPreviewThemeRegistryFromDirectories([presentationThemeDirectory])),
    }),
    formatting: Object.freeze({ formatMarkdownTables }),
    resources: Object.freeze({ resolveDocumentResource }),
    commands: Object.freeze({ registerFeatureContribution, listFeatureContributions }),
    ai: Object.freeze({
      hasConfiguredCopilotAccount,
      refreshCopilotConfiguredContext,
      ensureFeaturesEnabled: ensureAiFeaturesEnabled,
      assertFeaturesEnabled: assertAiFeaturesEnabled,
      isAuthorizationDenied: isAiAuthorizationDenied,
    }),
  });
}

function toPlainRecord(value: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze(JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
}

function listThemes(registry: unknown): readonly ThemeSummary[] {
  const definitions = [...((registry as { themes: Map<string, { name: string; label: string }> }).themes?.values() ?? [])];
  return Object.freeze(definitions.map((theme) => Object.freeze({ name: theme.name, label: theme.label })));
}
