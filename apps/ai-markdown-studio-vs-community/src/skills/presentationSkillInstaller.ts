import * as vscode from 'vscode';

const SKILL_FILE_NAME = 'SKILL.md';
const PORTABLE_SKILL_NAME = 'markdown-ai-studio-presentation';
const COPILOT_SKILL_NAME = 'markdown-ai-studio-presentation-copilot';
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
    await installPresentationSkillInWorkspace(context, resource, workspaceFolder);
    return;
  }

  await context.workspaceState.update(dismissalKey, true);
}

export async function installPresentationSkillInWorkspace(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
  preferredWorkspaceFolder?: vscode.WorkspaceFolder,
): Promise<void> {
  const workspaceFolder = preferredWorkspaceFolder ?? await resolveWorkspaceFolder(resource, true);
  if (!workspaceFolder) {
    return;
  }

  const targetProfile = await chooseSkillTarget();
  if (!targetProfile) {
    return;
  }

  const target = skillFileUri(workspaceFolder, targetProfile);
  if (await uriExists(target)) {
    void vscode.window.showInformationMessage(`${targetProfile.label} presentation skill already exists in this workspace. It was not changed.`);
    return;
  }

  const source = vscode.Uri.joinPath(context.extensionUri, 'skills', targetProfile.sourceSkillName, SKILL_FILE_NAME);
  const content = await vscode.workspace.fs.readFile(source);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, ...targetProfile.workspacePath));
  await vscode.workspace.fs.writeFile(target, content);
  void vscode.window.showInformationMessage(`Installed the ${targetProfile.label} presentation skill at ${target.fsPath}.`);
}

async function chooseSkillTarget(): Promise<PresentationSkillTarget | undefined> {
  const selected = await vscode.window.showQuickPick(
    SKILL_TARGETS.map((target) => ({ label: target.label, description: target.description, target })),
    { placeHolder: 'Choose the AI agent that should receive the presentation skill' },
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
    void vscode.window.showInformationMessage('Open a workspace folder before installing the presentation skill.');
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
  } catch {
    return false;
  }
}
