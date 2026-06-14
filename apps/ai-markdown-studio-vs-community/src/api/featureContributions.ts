import * as vscode from 'vscode';
import type { FeatureContribution } from '@mfo/community-api';

const contributions = new Map<string, FeatureContribution>();

export function registerFeatureContribution(contribution: FeatureContribution): vscode.Disposable {
  if (contributions.has(contribution.id)) {
    throw new Error(`A AI Markdown Studio feature contribution with id "${contribution.id}" is already registered.`);
  }

  const frozen = Object.freeze({
    ...contribution,
    commands: Object.freeze(contribution.commands.map((command) => Object.freeze({
      ...command,
      replaces: command.replaces ? Object.freeze([...command.replaces]) : undefined,
    }))),
  });
  contributions.set(frozen.id, frozen);

  return new vscode.Disposable(() => {
    if (contributions.get(frozen.id) === frozen) {
      contributions.delete(frozen.id);
    }
  });
}

export function listFeatureContributions(): readonly FeatureContribution[] {
  return Object.freeze([...contributions.values()]);
}
