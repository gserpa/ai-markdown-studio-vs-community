export function distributeItemsAcrossSlots<T>(items: readonly T[], slotCount: number): T[][] {
  if (slotCount <= 0) {
    return [];
  }

  const slots = Array.from({ length: slotCount }, () => [] as T[]);
  let nextIndex = 0;

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const remainingItems = items.length - nextIndex;
    const remainingSlots = slotCount - slotIndex;
    if (remainingItems <= 0) {
      break;
    }

    const slotSize = Math.ceil(remainingItems / remainingSlots);
    slots[slotIndex] = items.slice(nextIndex, nextIndex + slotSize);
    nextIndex += slotSize;
  }

  return slots;
}