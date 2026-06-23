import type * as vscode from 'vscode';

export interface FeatureCommandContribution {
  readonly command: string;
  readonly title: string;
  readonly order?: number;
  readonly requiresAi?: boolean;
  readonly presentationOnly?: boolean;
  readonly replaces?: readonly string[];
}

export interface FeatureContribution {
  readonly id: string;
  readonly title: string;
  readonly commands: readonly FeatureCommandContribution[];
}

export interface RenderedMarkdown {
  readonly html: string;
}

export interface RenderedPresentation {
  readonly html: string;
  readonly presentation: Readonly<Record<string, unknown>>;
}

export interface ThemeSummary {
  readonly name: string;
  readonly label: string;
}

export interface CommunityApiV1 {
  readonly apiVersion: '1.0';
  readonly extensionVersion: string;
  readonly rendering: {
    renderMarkdown(markdown: string): RenderedMarkdown;
    renderPresentation(markdown: string): RenderedPresentation;
    buildStandaloneHtml(
      document: vscode.TextDocument,
      options?: {
        exportMode?: 'theme' | 'paper' | 'paper-borderless';
      },
    ): Promise<string>;
  };
  readonly parsing: {
    detectDocumentKind(markdown: string): 'document' | 'presentation';
    parsePresentation(markdown: string): Readonly<Record<string, unknown>>;
  };
  readonly themes: {
    listDocumentThemes(): readonly ThemeSummary[];
    listPresentationThemes(): readonly ThemeSummary[];
  };
  readonly formatting: {
    formatMarkdownTables(markdown: string): string;
  };
  readonly resources: {
    resolveDocumentResource(document: vscode.TextDocument, rawPath: string): vscode.Uri | undefined;
  };
  readonly commands: {
    registerFeatureContribution(contribution: FeatureContribution): vscode.Disposable;
    listFeatureContributions(): readonly FeatureContribution[];
  };
  readonly ai: {
    hasConfiguredCopilotAccount(): Promise<boolean>;
    refreshCopilotConfiguredContext(): Promise<boolean>;
    ensureFeaturesEnabled(): Promise<boolean>;
    assertFeaturesEnabled(): void;
    isAuthorizationDenied(): boolean;
  };
}
