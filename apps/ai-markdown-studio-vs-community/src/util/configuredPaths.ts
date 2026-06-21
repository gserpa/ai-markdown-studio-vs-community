import * as path from 'node:path';

export function resolveConfiguredAbsolutePath(configuredValue: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const expandedValue = expandWindowsEnvironmentVariables(configuredValue.trim(), env);
  if (!expandedValue) {
    return undefined;
  }

  const normalizedPath = path.normalize(expandedValue);
  if (!path.isAbsolute(normalizedPath)) {
    return undefined;
  }

  return normalizedPath;
}

function expandWindowsEnvironmentVariables(value: string, env: NodeJS.ProcessEnv): string {
  if (!value.includes('%')) {
    return value;
  }

  const lookup = new Map(
    Object.entries(env).map(([name, envValue]) => [name.toLowerCase(), envValue ?? '']),
  );

  return value.replace(/%([^%]+)%/gu, (match, variableName: string) => {
    const replacement = lookup.get(variableName.toLowerCase());
    return replacement === undefined ? match : replacement;
  });
}
