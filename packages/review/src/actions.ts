import { readReviewComments, writeReviewComments, type ReviewComment, type ReviewRange } from '@mfo/core';
import type { ReviewPreview } from './preview';

export type ReviewRequest = {
  command?: string;
  action?: string;
  sessionId?: string;
  requestId?: number;
  version?: number;
  id?: string;
  body?: string;
  includeInAi?: boolean;
  selection?: unknown;
  afterEdit?: 'resolve' | 'reopen' | 'delete' | 'reattach';
};

export type ReviewSnapshot = {
  markdown: string;
  version: number;
  sessionId: string;
  preview: ReviewPreview;
};

export type ApplyReviewEdit = (markdown: string, expectedVersion: number, sessionId: string) => Promise<boolean>;

export function setReviewCommentState(comment: ReviewComment, state: 'open' | 'resolved'): ReviewComment {
  const { resolutionReopened, ...rest } = comment;
  if (state === 'open' && (resolutionReopened || (comment.state === 'resolved' && comment.resolution))) {
    return { ...rest, state, resolutionReopened: true };
  }
  return { ...rest, state };
}

export function createReviewActionHandler(
  readSelection: (markdown: string, preview: ReviewPreview, selection: unknown) => ReviewRange,
) {
  const updateComments = createReviewCommentActions(readSelection);
  return async function applyReviewAction(snapshot: ReviewSnapshot, request: ReviewRequest, apply: ApplyReviewEdit): Promise<void> {
    if (!request || typeof request !== 'object' || Array.isArray(request)
      || typeof snapshot.sessionId !== 'string' || !snapshot.sessionId
      || request.sessionId !== snapshot.sessionId
      || !Number.isSafeInteger(snapshot.version) || snapshot.version < 0
      || request.version !== snapshot.version || snapshot.preview.version !== snapshot.version
      || typeof request.requestId !== 'number' || !Number.isSafeInteger(request.requestId) || request.requestId < 1) {
      throw new Error('The preview changed. Select the text again.');
    }
    const stored = readReviewComments(snapshot.markdown);
    if (stored.error) throw new Error(stored.error);
    const comments = updateComments(stored.markdown, stored.comments, snapshot.preview, request);
    const updated = writeReviewComments(snapshot.markdown, comments);
    if (!await apply(updated, snapshot.version, snapshot.sessionId)) {
      throw new Error('The Markdown changed. Try the review action again.');
    }
  };
}

export function createReviewCommentActions(
  readSelection: (markdown: string, preview: ReviewPreview, selection: unknown) => ReviewRange,
) {
  return function updateComments(
    markdown: string, comments: ReviewComment[], preview: ReviewPreview, request: ReviewRequest,
  ): ReviewComment[] {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid review action.');
    if (request.includeInAi !== undefined && typeof request.includeInAi !== 'boolean') throw new Error('Invalid review action.');
    if (request.action === 'edit' && request.afterEdit !== undefined
      && !['resolve', 'reopen', 'delete', 'reattach'].includes(request.afterEdit)) throw new Error('Unknown review action.');
    const body = typeof request.body === 'string' ? request.body.trim() : '';
    if ((request.action === 'add' || request.action === 'edit') && (!body || body.length > 20_000)) {
      throw new Error('Enter a comment of up to 20,000 characters.');
    }
    if (request.action === 'add') {
      const range = readSelection(markdown, preview, request.selection);
      const next = comments.reduce((max, comment) => Math.max(max, Number(comment.id)), 0) + 1;
      if (!Number.isSafeInteger(next)) throw new Error('No more review comment IDs are available.');
      return [...comments, { id: String(next), body, range, includeInAi: request.includeInAi !== false, state: 'open' }];
    }
    const index = comments.findIndex(comment => comment.id === request.id);
    if (index < 0) throw new Error('This comment is no longer in the document.');
    const comment = comments[index];
    comments = [...comments];
    switch (request.action) {
      case 'edit':
        comments[index] = { ...comment, body, includeInAi: request.includeInAi !== false };
        if (request.afterEdit === 'resolve') comments[index] = setReviewCommentState(comments[index], 'resolved');
        else if (request.afterEdit === 'reopen') comments[index] = setReviewCommentState(comments[index], 'open');
        else if (request.afterEdit === 'delete') comments.splice(index, 1);
        break;
      case 'toggle':
        comments[index] = { ...comment, includeInAi: request.includeInAi === true };
        break;
      case 'resolve':
        comments[index] = setReviewCommentState(comment, 'resolved');
        break;
      case 'reopen':
        comments[index] = setReviewCommentState(comment, 'open');
        break;
      case 'delete':
        comments.splice(index, 1);
        break;
      case 'reattach':
        comments[index] = { ...comment, range: readSelection(markdown, preview, request.selection) };
        break;
      default:
        throw new Error('Unknown review action.');
    }
    return comments;
  };
}
