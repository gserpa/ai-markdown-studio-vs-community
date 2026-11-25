import * as vscode from 'vscode';

const SKILL_FILE_NAME = 'SKILL.md';
const PORTABLE_SKILL_NAME = 'markdown-ai-studio-presentation';
const COPILOT_SKILL_NAME = 'markdown-ai-studio-presentation-copilot';
const REVIEW_SKILL_NAME = 'revise-from-comments';
const RECOMMENDATION_DISMISSED_KEY = 'markdownAiStudio.presentationSkill.recommendationDismissed';

type PresentationSkillTarget = {
  id: 'copilot' | 'claude' | 'codex';
  label: string;
  description: string;
  sourceSkillName: string;
  workspacePath: readonly string[];
};

const SKILL_TARGETS: readonly PresentationSkillTarget[] = [
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    description: 'Install the tool-first skill in .github/skills.',
    sourceSkillName: COPILOT_SKILL_NAME,
    workspacePath: ['.github', 'skills', COPILOT_SKILL_NAME],
  },
  {
    id: 'claude',
    label: 'Claude',
    description: 'Install the complete standalone skill in .claude/skills.',
    sourceSkillName: PORTABLE_SKILL_NAME,
    workspacePath: ['.claude', 'skills', PORTABLE_SKILL_NAME],
  },
  {
    id: 'codex',
    label: 'Codex',
    description: 'Install the complete standalone skill in .agents/skills.',
    sourceSkillName: PORTABLE_SKILL_NAME,
    workspacePath: ['.agents', 'skills', PORTABLE_SKILL_NAME],
  },
];

export async function offerPresentationSkillInstallation(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
): Promise<void> {
  const workspaceFolder = await resolveWorkspaceFolder(resource, false);
  if (!workspaceFolder || await hasInstalledPresentationSkill(workspaceFolder)) {
    return;
  }

  const dismissalKey = `${RECOMMENDATION_DISMISSED_KEY}.${workspaceFolder.uri.toString()}`;
  if (context.workspaceState.get<boolean>(dismissalKey)) {
    return;
  }

  const selected = await vscode.window.showInformationMessage(
    'Install an AI Markdown Studio presentation skill for GitHub Copilot, Claude, or Codex?',
    'Install Skill',
    'Not Now',
  );
  if (selected === 'Install Skill') {
    await installSkillsInWorkspace(context, resource, workspaceFolder, false);
    return;
  }

  await context.workspaceState.update(dismissalKey, true);
}

export async function installPresentationSkillInWorkspace(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
): Promise<void> {
  await installSkillsInWorkspace(context, resource, undefined, true);
}

async function installSkillsInWorkspace(
  context: vscode.ExtensionContext,
  resource: vscode.Uri | undefined,
  preferredWorkspaceFolder: vscode.WorkspaceFolder | undefined,
  includeReview: boolean,
): Promise<void> {
  const workspaceFolder = preferredWorkspaceFolder ?? await resolveWorkspaceFolder(resource, true);
  if (!workspaceFolder) {
    return;
  }

  const targetProfile = await chooseSkillTarget(includeReview);
  if (!targetProfile) {
    return;
  }

  const skills = [{
    label: 'presentation',
    sourceName: targetProfile.sourceSkillName,
    workspacePath: targetProfile.workspacePath,
    reference: true,
  }, ...(includeReview ? [{
    label: 'review',
    sourceName: REVIEW_SKILL_NAME,
    workspacePath: [...targetProfile.workspacePath.slice(0, -1), REVIEW_SKILL_NAME],
    reference: false,
  }] : [])];
  const pending: typeof skills = [];
  const existing: string[] = [];
  for (const skill of skills) {
    const target = vscode.Uri.joinPath(workspaceFolder.uri, ...skill.workspacePath, SKILL_FILE_NAME);
    const reference = vscode.Uri.joinPath(workspaceFolder.uri, ...skill.workspacePath, 'references', 'visualizations.md');
    if (await uriExists(target) || (skill.reference && await uriExists(reference))) {
      existing.push(skill.label);
    } else {
      pending.push(skill);
    }
  }

  const contents = await Promise.all(pending.map(async (skill) => ({
    skill,
    content: await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'skills', skill.sourceName, SKILL_FILE_NAME)),
    reference: skill.reference
      ? await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'skills', skill.sourceName, 'references', 'visualizations.md'))
      : undefined,
  })));
  for (const { skill, content, reference } of contents) {
    const directory = vscode.Uri.joinPath(workspaceFolder.uri, ...skill.workspacePath);
    if (reference) {
      const referenceDirectory = vscode.Uri.joinPath(directory, 'references');
      await vscode.workspace.fs.createDirectory(referenceDirectory);
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(referenceDirectory, 'visualizations.md'), reference);
    } else {
      await vscode.workspace.fs.createDirectory(directory);
    }
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(directory, SKILL_FILE_NAME), content);
  }
  const messages = [
    pending.length ? `Installed ${targetProfile.label} ${pending.map(skill => skill.label).join(' and ')} ${pending.length === 1 ? 'skill' : 'skills'}.` : '',
    existing.length ? `Existing ${existing.join(' and ')} ${existing.length === 1 ? 'skill was' : 'skills were'} not changed.` : '',
  ].filter(Boolean);
  void vscode.window.showInformationMessage(messages.join(' '));
}

async function chooseSkillTarget(includeReview: boolean): Promise<PresentationSkillTarget | undefined> {
  const selected = await vscode.window.showQuickPick(
    SKILL_TARGETS.map((target) => ({ label: target.label, description: target.description, target })),
    { placeHolder: `Choose the AI agent that should receive the ${includeReview ? 'presentation and review skills' : 'presentation skill'}` },
  );
  return selected?.target;
}

async function resolveWorkspaceFolder(
  resource: vscode.Uri | undefined,
  showMissingWorkspaceMessage: boolean,
): Promise<vscode.WorkspaceFolder | undefined> {
  const activeResource = resource?.scheme === 'file'
    ? resource
    : vscode.window.activeTextEditor?.document.uri;
  const activeFolder = activeResource ? vscode.workspace.getWorkspaceFolder(activeResource) : undefined;
  if (activeFolder) {
    return activeFolder;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }
  if (workspaceFolders.length > 1) {
    const selected = await vscode.window.showQuickPick(
      workspaceFolders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
      { placeHolder: 'Choose the workspace that should receive the presentation skill' },
    );
    return selected?.folder;
  }

  if (showMissingWorkspaceMessage) {
    void vscode.window.showInformationMessage('Open a workspace folder before installing agent skills.');
  }
  return undefined;
}

async function hasInstalledPresentationSkill(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
  const knownSkillUris = [
    ...SKILL_TARGETS.map((target) => skillFileUri(workspaceFolder, target)),
    vscode.Uri.joinPath(workspaceFolder.uri, '.github', 'skills', PORTABLE_SKILL_NAME, SKILL_FILE_NAME),
  ];
  for (const skillUri of knownSkillUris) {
    if (await uriExists(skillUri)) {
      return true;
    }
  }
  return false;
}

function skillFileUri(workspaceFolder: vscode.WorkspaceFolder, target: PresentationSkillTarget): vscode.Uri {
  return vscode.Uri.joinPath(workspaceFolder.uri, ...target.workspacePath, SKILL_FILE_NAME);
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return false;
    throw error;
  }
}
