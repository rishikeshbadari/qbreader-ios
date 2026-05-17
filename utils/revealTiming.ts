export function getRevealIntervalMs(revealSpeed: number): number {
  const clamped = Math.min(1, Math.max(0, revealSpeed));
  if (clamped >= 0.99) {
    return 0;
  }
  const slowestMs = 650;
  const fastestMs = 80;
  return Math.round(slowestMs - (slowestMs - fastestMs) * clamped);
}

export function getQuestionWordCount(question?: string | null): number {
  return question?.split(/\s+/).filter(Boolean).length ?? 0;
}

export function getVisibleWordCountForTime(
  revealStartTime: number,
  revealIntervalMs: number,
  wordCount: number,
  now: number = Date.now(),
): number {
  if (wordCount <= 0) return 0;
  if (revealIntervalMs <= 0) return wordCount;
  const elapsed = now - revealStartTime;
  return elapsed < 0
    ? 0
    : Math.min(Math.floor(elapsed / revealIntervalMs) + 1, wordCount);
}

export function getRevealStartTimeForWordIndex(
  wordIndex: number,
  revealIntervalMs: number,
  resumedAt: number,
): number {
  if (revealIntervalMs <= 0) return resumedAt;
  if (wordIndex <= 0) return resumedAt + revealIntervalMs;
  return resumedAt - (wordIndex - 1) * revealIntervalMs;
}
