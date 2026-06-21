import * as vscode from 'vscode';
import { getMpsCompletions, getMpsHover, getMpsQuickFixes, validateMpsSource } from '@mfo/core';
import { createMpsDocumentSchema, createMarkdownDocumentSchema, isMarkdownPresentationSource } from '@mfo/core';
import { loadPreviewThemeRegistryForDocument } from './previewThemeSupport';
import { loadDocumentThemeRegistryForDocument } from '../document/documentThemeSupport';

export function registerMpsEditorSupport(extensionUri: vscode.Uri): vscode.Disposable {
  const diagnostics = vscode.languages.createDiagnosticCollection('markdownAiStudio.mps');

  const getSchema = (document: vscode.TextDocument) => {
    const source = document.getText();
    if (isMarkdownPresentationSource(source)) {
      const themeRegistry = loadPreviewThemeRegistryForDocument(extensionUri, document.uri);
      return createMpsDocumentSchema(themeRegistry.themes.keys());
    } else {
      const docThemeRegistry = loadDocumentThemeRegistryForDocument(extensionUri, document.uri);
      return createMarkdownDocumentSchema(docThemeRegistry.themes.keys());
    }
  };

  const updateDiagnostics = (document: vscode.TextDocument): void => {
    if (document.languageId !== 'markdown') {
      diagnostics.delete(document.uri);
      return;
    }

    const schema = getSchema(document);
    const issues = validateMpsSource(document.getText(), schema);
    diagnostics.set(document.uri, issues.map((issue) => {
      const range = new vscode.Range(document.positionAt(issue.start), document.positionAt(issue.end));
      const diagnostic = new vscode.Diagnostic(range, issue.message, toDiagnosticSeverity(issue.severity));
      diagnostic.code = issue.code;
      diagnostic.source = 'AI Markdown Studio';
      return diagnostic;
    }));
  };

  for (const document of vscode.workspace.textDocuments) {
    updateDiagnostics(document);
  }

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'markdown' },
    {
      provideCompletionItems(document, position) {
        const schema = getSchema(document);
        const offset = document.offsetAt(position);
        const completions = getMpsCompletions(document.getText(), offset, schema);

        return completions.map((completion) => {
          const item = new vscode.CompletionItem(completion.label, toCompletionItemKind(completion.kind));
          item.detail = completion.detail;
          item.documentation = completion.documentation;
          item.range = new vscode.Range(document.positionAt(completion.replaceStart), document.positionAt(completion.replaceEnd));
          item.insertText = completion.isSnippet
            ? new vscode.SnippetString(completion.insertText)
            : completion.insertText;
          return item;
        });
      },
    },
    ':',
    '<',
    '-',
  );

  const hoverProvider = vscode.languages.registerHoverProvider(
    { language: 'markdown' },
    {
      provideHover(document, position) {
        const schema = getSchema(document);
        const hover = getMpsHover(document.getText(), document.offsetAt(position), schema);
        if (!hover) {
          return undefined;
        }

        return new vscode.Hover(
          new vscode.MarkdownString(hover.markdown),
          new vscode.Range(document.positionAt(hover.start), document.positionAt(hover.end)),
        );
      },
    },
  );

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    { language: 'markdown' },
    {
      provideCodeActions(document, _range, context) {
        const schema = getSchema(document);
        const source = document.getText();
        const issues = validateMpsSource(source, schema);
        const actions: vscode.CodeAction[] = [];
        const seen = new Set<string>();

        for (const diagnostic of context.diagnostics) {
          const matchingIssue = findMatchingIssue(document, diagnostic, issues);
          if (!matchingIssue) {
            continue;
          }

          for (const fix of getMpsQuickFixes(source, matchingIssue, schema)) {
            const key = `${fix.title}:${fix.start}:${fix.end}:${fix.newText}`;
            if (seen.has(key)) {
              continue;
            }

            seen.add(key);
            const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diagnostic];
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(
              document.uri,
              new vscode.Range(document.positionAt(fix.start), document.positionAt(fix.end)),
              fix.newText,
            );
            actions.push(action);
          }
        }

        return actions;
      },
    },
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    },
  );

  return vscode.Disposable.from(
    diagnostics,
    completionProvider,
    hoverProvider,
    codeActionProvider,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('markdownAiStudio')) {
        return;
      }

      for (const document of vscode.workspace.textDocuments) {
        updateDiagnostics(document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    vscode.workspace.onDidChangeTextDocument((event) => updateDiagnostics(event.document)),
  );
}

function findMatchingIssue(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  issues: ReturnType<typeof validateMpsSource>,
): ReturnType<typeof validateMpsSource>[number] | undefined {
  const diagnosticStart = document.offsetAt(diagnostic.range.start);
  const diagnosticEnd = document.offsetAt(diagnostic.range.end);
  const diagnosticCode = typeof diagnostic.code === 'object'
    ? diagnostic.code.value
    : diagnostic.code;

  return issues.find((issue) => (
    issue.start === diagnosticStart
    && issue.end === diagnosticEnd
    && issue.message === diagnostic.message
    && issue.code === diagnosticCode
  ));
}

function toDiagnosticSeverity(severity: 'error' | 'warning' | 'information'): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'information':
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

function toCompletionItemKind(kind: 'snippet' | 'property' | 'value' | 'directive'): vscode.CompletionItemKind {
  switch (kind) {
    case 'property':
      return vscode.CompletionItemKind.Property;
    case 'value':
      return vscode.CompletionItemKind.Value;
    case 'directive':
      return vscode.CompletionItemKind.Event;
    default:
      return vscode.CompletionItemKind.Snippet;
  }
}
