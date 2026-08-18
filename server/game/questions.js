import prisma from '../lib/prisma.js';

function shuffleQuestion(q) {
  const options = [q.optionA, q.optionB, q.optionC, q.optionD];
  const correctIndex = ['A', 'B', 'C', 'D'].indexOf(q.correctOption);

  const indexed = options.map((text, index) => ({ text, index }));
  for (let i = indexed.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }

  return {
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl || null,
    options: indexed.map((item) => item.text),
    correctIndex: indexed.findIndex((item) => item.index === correctIndex)
  };
}

export async function pickQuestionsForMatch(topicId, count = 7) {
  const all = await prisma.question.findMany({ where: { topicId } });

  if (all.length < count) {
    throw new Error(`Topic needs at least ${count} questions. Found ${all.length}.`);
  }

  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count).map(shuffleQuestion);
}
