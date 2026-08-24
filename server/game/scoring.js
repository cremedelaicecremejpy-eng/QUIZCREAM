export const TIME_LIMIT_MS = 7000;
export const BASE_MAX_POINTS = 20;
export const BASE_MIN_POINTS = 10;
export const DEFAULT_QUESTION_COUNT = 7;

export function isLastRound(questionIndex, totalQuestions) {
  return questionIndex === totalQuestions - 1;
}

export function getQuestionPointBounds(questionIndex, totalQuestions) {
  const multiplier = isLastRound(questionIndex, totalQuestions) ? 2 : 1;

  return {
    min: BASE_MIN_POINTS * multiplier,
    max: BASE_MAX_POINTS * multiplier
  };
}

export function getMaxPossibleScore(totalQuestions = DEFAULT_QUESTION_COUNT) {
  let total = 0;

  for (let i = 0; i < totalQuestions; i += 1) {
    total += getQuestionPointBounds(i, totalQuestions).max;
  }

  return total;
}

export function getTimeLeftMs(elapsedMs) {
  return Math.max(0, TIME_LIMIT_MS - elapsedMs);
}

export function calculatePoints(timeLeftMs, questionIndex, totalQuestions) {
  const { min, max } = getQuestionPointBounds(questionIndex, totalQuestions);
  const ratio = Math.max(0, Math.min(1, timeLeftMs / TIME_LIMIT_MS));

  return Math.round(min + (max - min) * ratio);
}

export function scoreAnswer({ isCorrect, timeMs, questionIndex, totalQuestions }) {
  if (!isCorrect) return 0;

  return calculatePoints(getTimeLeftMs(timeMs), questionIndex, totalQuestions);
}
