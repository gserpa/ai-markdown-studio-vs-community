import * as vscode from 'vscode';
import {
  createPresentationPrompt,
  validateMarkdownStudioPresentation,
} from '@mfo/ai-core';
import {
  createUniqueUri,
  ensureDirectory,
  getPrimaryWorkspaceFolder,
  normalizeMarkdownFilename,
  normalizeWorkspaceRelativeDirectory,
  readWorkspaceTextFile,
} from '../util/workspaceFiles';

const TOOL_BUILD_PRESENTATION_PROMPT = 'markdown_ai_studio_build_presentation_prompt';
const TOOL_VALIDATE_PRESENTATION = 'markdown_ai_studio_validate_presentation';
const TOOL_SAVE_MARKDOWN_FILE = 'markdown_ai_studio_save_markdown_file';

type BuildPresentationPromptInput = {
  brief: string;
  audience?: string;
  tone?: string;
  slideCount?: number;
  theme?: string;
  ratio?: '16:9' | '4:3';
};

type ValidatePresentationInput = {
  markdown?: string;
  uri?: string;
};

type SaveMarkdownFileInput = {
  filename: string;
  content: string;
  workspaceRelativeDirectory?: string;
};

export function registerLanguageModelTools(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.lm.registerTool(TOOL_BUILD_PRESENTATION_PROMPT, new BuildPresentationPromptTool()),
    vscode.lm.registerTool(TOOL_VALIDATE_PRESENTATION, new ValidatePresentationTool()),
    vscode.lm.registerTool(TOOL_SAVE_MARKDOWN_FILE, new SaveMarkdownFileTool()),
  );
}

class BuildPresentationPromptTool implements vscode.LanguageModelTool<BuildPresentationPromptInput> {
  invoke(options: vscode.LanguageModelToolInvocationOptions<BuildPresentationPromptInput>): vscode.LanguageModelToolResult {
    const input = options.input;
    const allowRemoteResources = vscode.workspace.getConfiguration('markdownAiStudio').get<boolean>('allowRemoteResources', true);
    const prompt = createPresentationPrompt({
      brief: requireNonEmpty(input.brief, 'brief'),
      audience: input.audience?.trim() || 'General audience',
      tone: input.tone?.trim() || 'Professional',
      length: formatSlideCount(input.slideCount),
      presentationTheme: input.theme?.trim() || 'galaxy',
      presentationRatio: input.ratio === '4:3' ? '4:3' : '16:9',
      allowRemoteResources,
    });

    return textResult(prompt);
  }

  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: 'Building Markdown AI Studio presentation prompt...' };
  }
}

class ValidatePresentationTool implements vscode.LanguageModelTool<ValidatePresentationInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ValidatePresentationInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const markdown = options.input.markdown?.trim()
      || await readWorkspaceTextFile(options.input.uri, 'Presentation');
    if (!markdown.trim()) {
      throw new Error('Provide presentation Markdown content or a workspace file URI to validate.');
    }

    return textResult(JSON.stringify(validateMarkdownStudioPresentation(markdown), null, 2));
  }

  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: 'Validating Markdown AI Studio presentation...' };
  }
}

class SaveMarkdownFileTool implements vscode.LanguageModelTool<SaveMarkdownFileInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SaveMarkdownFileInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const workspaceFolder = getPrimaryWorkspaceFolder();
    const filename = normalizeMarkdownFilename(requireNonEmpty(options.input.filename, 'filename'));
    const content = requireNonEmpty(options.input.content, 'content');
    const directorySegments = normalizeWorkspaceRelativeDirectory(options.input.workspaceRelativeDirectory);
    const directoryUri = vscode.Uri.joinPath(workspaceFolder.uri, ...directorySegments);
    const targetUri = await createUniqueUri(directoryUri, filename);

    await ensureDirectory(directoryUri);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(`${content.replace(/\s+$/u, '')}\n`, 'utf8'));

    return textResult(JSON.stringify({
      saved: true,
      uri: targetUri.toString(),
      fsPath: targetUri.fsPath,
      kind: isPresentationMarkdown(content) ? 'presentation' : 'document',
    }, null, 2));
  }

  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<SaveMarkdownFileInput>): vscode.PreparedToolInvocation {
    const filename = options.input.filename || 'generated.md';
    const directory = options.input.workspaceRelativeDirectory?.trim() || '.';
    return {
      invocationMessage: `Saving Markdown file ${filename}...`,
      confirmationMessages: {
        title: 'Save Markdown file',
        message: `Create a new Markdown file named \`${filename}\` in workspace directory \`${directory}\`. Existing files will not be overwritten.`,
      },
    };
  }
}

function formatSlideCount(slideCount: number | undefined): string {
  if (slideCount === undefined || !Number.isSafeInteger(slideCount) || slideCount < 1) {
    return '8 slides';
  }

  return `${slideCount} slides`;
}

function isPresentationMarkdown(markdown: string): boolean {
  return /^---[\s\S]*?\ndocument:\s*presentation\b[\s\S]*?\n---/iu.test(markdown);
}

function requireNonEmpty(value: string | undefined, fieldName: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
