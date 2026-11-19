import { readReviewComments } from '@mfo/core';
import { embedMarkdownImages } from '../../images/embedMarkdownImages';

export async function preparePortableMarkdown(
  source: string,
  loadImage: (source: string) => Promise<string>,
): Promise<string> {
  const before = readReviewComments(source);
  if (before.error) throw new Error(before.error);

  const cache = new Map<string, Promise<string>>();
  const load = (path: string) => {
    let pending = cache.get(path);
    if (!pending) {
      pending = loadImage(path);
      cache.set(path, pending);
    }
    return pending;
  };
  const frontMatter = frontMatterPrefix(source);
  const cleanFrontMatter = frontMatterPrefix(before.markdown);
  const result = await embedMarkdownImages(source.slice(frontMatter.length), load);
  const clean = await embedMarkdownImages(before.markdown.slice(cleanFrontMatter.length), load);
  const failures = [...result.failures, ...clean.failures]
    .filter((failure, index, all) => all.findIndex(item => item.source === failure.source) === index);
  if (failures.length) {
    const details = failures.map(failure => `${failure.source}: ${failure.message}`).join('\n');
    throw new Error(`Cannot export portable HTML: could not embed image(s).\n${details}`);
  }
  const markdown = frontMatter + result.markdown;
  const after = readReviewComments(markdown);
  const mapOffset = (offset: number): number | undefined => {
    let adjusted = offset;
    for (const edit of clean.replacements) {
      const start = edit.start + cleanFrontMatter.length;
      const end = edit.end + cleanFrontMatter.length;
      if (offset > start && offset < end) return undefined;
      if (offset >= end) adjusted += edit.value.length - (end - start);
    }
    return adjusted;
  };
  if (after.error || after.markdown !== cleanFrontMatter + clean.markdown
    || before.comments.length !== after.comments.length
    || before.comments.some(comment => {
      const current = after.comments.find(item => item.id === comment.id);
      if (!current || current.body !== comment.body || current.state !== comment.state
        || current.includeInAi !== comment.includeInAi || Boolean(current.range) !== Boolean(comment.range)) return true;
      return comment.range && current.range
        && (mapOffset(comment.range.start) !== current.range.start || mapOffset(comment.range.end) !== current.range.end);
    })) {
    throw new Error('Cannot export portable HTML: embedding images would change a review comment or its selection.');
  }
  return markdown;
}

function frontMatterPrefix(source: string): string {
  const opening = source.match(/^\uFEFF?---[ \t]*\r?\n/u);
  if (!opening) return '';
  const closing = /^---[ \t]*(?:\r?\n|$)/gmu;
  closing.lastIndex = opening[0].length;
  return closing.exec(source) ? source.slice(0, closing.lastIndex) : '';
}
