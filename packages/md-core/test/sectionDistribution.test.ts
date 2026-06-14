import { describe, expect, it } from 'vitest';
import { distributeItemsAcrossSlots } from '../src/presentation/sectionDistribution';

describe('distributeItemsAcrossSlots', () => {
  it('splits items evenly while preserving order', () => {
    const distributed = distributeItemsAcrossSlots(['one', 'two', 'three', 'four'], 2);

    expect(distributed).toEqual([
      ['one', 'two'],
      ['three', 'four'],
    ]);
  });

  it('keeps earlier slots at most one item larger when division is uneven', () => {
    const distributed = distributeItemsAcrossSlots(['one', 'two', 'three', 'four', 'five'], 2);

    expect(distributed).toEqual([
      ['one', 'two', 'three'],
      ['four', 'five'],
    ]);
  });

  it('returns empty trailing slots when there are fewer items than slots', () => {
    const distributed = distributeItemsAcrossSlots(['one', 'two'], 4);

    expect(distributed).toEqual([
      ['one'],
      ['two'],
      [],
      [],
    ]);
  });
});