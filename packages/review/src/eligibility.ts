import type { ReviewComment } from '@mfo/core';

export function isAiReviewEligible(comment: ReviewComment): boolean {
  return comment.includeInAi && comment.state === 'open' && comment.range !== undefined;
}
