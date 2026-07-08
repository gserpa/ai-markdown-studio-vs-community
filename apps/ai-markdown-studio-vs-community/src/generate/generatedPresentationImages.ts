const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]+\)))?\s*\)/gu;
const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?|avif)(?:$|[?#])/iu;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const HEAD_FALLBACK_STATUS_CODES = new Set([400, 403, 405, 406, 409, 412, 415, 501]);
const VERIFY_TIMEOUT_MS = 5_000;
const VERIFY_RETRY_COUNT = 2;
const VERIFY_BASE_DELAY_MS = 350;
const VERIFY_THROTTLE_DELAY_MS = 180;

export type NormalizeGeneratedPresentationImagesOptions = {
  allowRemoteResources: boolean;
  providedImageSource?: string;
  fetchFn?: typeof fetch;
  isCancellationRequested?: () => boolean;
};

export type NormalizeGeneratedPresentationImagesResult = {
  markdown: string;
  replacements: GeneratedImageReplacement[];
};

export type GeneratedImageReplacement = {
  alt: string;
  originalTarget: string;
  reason: 'remote-disallowed' | 'unverifiable-remote' | 'invented-local';
};

type VerificationOutcome = 'valid' | 'invalid';

export async function normalizeGeneratedPresentationImages(
  markdown: string,
  options: NormalizeGeneratedPresentationImagesOptions,
): Promise<NormalizeGeneratedPresentationImagesResult> {
  const matches = [...markdown.matchAll(MARKDOWN_IMAGE_PATTERN)];
  if (matches.length === 0) {
    return { markdown, replacements: [] };
  }

  const providedImageSource = options.providedImageSource ?? '';
  const verificationCache = new Map<string, VerificationOutcome>();
  const replacements: Array<{ start: number; end: number; replacement: string; meta: GeneratedImageReplacement }> = [];

  for (const match of matches) {
    if (options.isCancellationRequested?.()) {
      break;
    }

    const fullMatch = match[0];
    const alt = collapseWhitespace(match[1] ?? '');
    const rawTarget = match[2] ?? '';
    const normalizedTarget = unwrapAngleBrackets(rawTarget);
    const start = match.index ?? 0;
    const end = start + fullMatch.length;

    if (!normalizedTarget) {
      continue;
    }

    if (isDataImageUri(normalizedTarget) || isUserSuppliedTarget(normalizedTarget, providedImageSource)) {
      continue;
    }

    if (isHttpUrl(normalizedTarget)) {
      if (!options.allowRemoteResources) {
        replacements.push({
          start,
          end,
          replacement: buildImageSuggestion(alt, normalizedTarget, true),
          meta: {
            alt,
            originalTarget: normalizedTarget,
            reason: 'remote-disallowed',
          },
        });
        continue;
      }

      let verification = verificationCache.get(normalizedTarget);
      if (!verification) {
        verification = await verifyRemoteImageUrl(normalizedTarget, options);
        verificationCache.set(normalizedTarget, verification);
        if (options.isCancellationRequested?.()) {
          break;
        }
        await delay(VERIFY_THROTTLE_DELAY_MS, options.isCancellationRequested);
      }

      if (verification === 'valid') {
        continue;
      }

      replacements.push({
        start,
        end,
        replacement: buildImageSuggestion(alt, normalizedTarget, true),
        meta: {
          alt,
          originalTarget: normalizedTarget,
          reason: 'unverifiable-remote',
        },
      });
      continue;
    }

    replacements.push({
      start,
      end,
      replacement: buildImageSuggestion(alt, normalizedTarget, false),
      meta: {
        alt,
        originalTarget: normalizedTarget,
        reason: 'invented-local',
      },
    });
  }

  if (replacements.length === 0) {
    return { markdown, replacements: [] };
  }

  let rewritten = markdown;
  for (const replacement of [...replacements].reverse()) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.replacement}${rewritten.slice(replacement.end)}`;
  }

  return {
    markdown: rewritten,
    replacements: replacements.map((entry) => entry.meta),
  };
}

async function verifyRemoteImageUrl(
  url: string,
  options: NormalizeGeneratedPresentationImagesOptions,
): Promise<VerificationOutcome> {
  const fetchFn = options.fetchFn ?? fetch;
  let delayMs = VERIFY_BASE_DELAY_MS;

  for (let attempt = 0; attempt <= VERIFY_RETRY_COUNT; attempt += 1) {
    if (options.isCancellationRequested?.()) {
      return 'invalid';
    }

    const headResult = await probeImageUrl(url, 'HEAD', fetchFn, options);
    if (headResult === 'valid') {
      return 'valid';
    }

    if (headResult === 'retry') {
      await delay(delayMs, options.isCancellationRequested);
      delayMs *= 2;
      continue;
    }

    if (headResult === 'fallback-get') {
      const getResult = await probeImageUrl(url, 'GET', fetchFn, options);
      if (getResult === 'valid') {
        return 'valid';
      }

      if (getResult === 'retry') {
        await delay(delayMs, options.isCancellationRequested);
        delayMs *= 2;
        continue;
      }
    }

    return 'invalid';
  }

  return 'invalid';
}

async function probeImageUrl(
  url: string,
  method: 'HEAD' | 'GET',
  fetchFn: typeof fetch,
  options: NormalizeGeneratedPresentationImagesOptions,
): Promise<'valid' | 'invalid' | 'retry' | 'fallback-get'> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: method === 'GET'
        ? {
            Range: 'bytes=0-0',
          }
        : undefined,
    });

    if (response.ok) {
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      if (contentType.startsWith('image/') || IMAGE_EXTENSION_PATTERN.test(response.url || url)) {
        return 'valid';
      }
      return 'invalid';
    }

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      return 'retry';
    }

    if (method === 'HEAD' && HEAD_FALLBACK_STATUS_CODES.has(response.status)) {
      return 'fallback-get';
    }

    return 'invalid';
  } catch {
    return 'retry';
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildImageSuggestion(alt: string, originalTarget: string, includeLink: boolean): string {
  const description = toSuggestionDescription(alt);
  if (!includeLink) {
    return `> Image suggestion: ${description}`;
  }

  return `> Image suggestion: [${description}](${originalTarget})`;
}

function toSuggestionDescription(alt: string): string {
  const normalized = collapseWhitespace(alt)
    .replace(/[[\]]/gu, '')
    .trim();
  return normalized || 'Replace with a verified image';
}

function unwrapAngleBrackets(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function isUserSuppliedTarget(target: string, providedImageSource: string): boolean {
  return providedImageSource.toLowerCase().includes(target.toLowerCase());
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function isDataImageUri(value: string): boolean {
  return /^data:image\//iu.test(value);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

async function delay(milliseconds: number, isCancellationRequested?: () => boolean): Promise<void> {
  if (milliseconds <= 0 || isCancellationRequested?.()) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
