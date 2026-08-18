import { pickQuestionsForMatch } from './questions.js';
import { scoreAnswer, TIME_LIMIT_MS } from './scoring.js';
import { persistMatchResult } from './persistMatch.js';

const ROUND_DELAY_MS = 2500;
const PRE_MATCH_COUNTDOWN_SEC = 3;
const QUESTION_COUNT = 7;

const activeMatches = new Map();
const socketToMatch = new Map();

export class MatchManager {
  constructor(io) {
    this.io = io;
  }

  getMatchForSocket(socketId) {
    const matchId = socketToMatch.get(socketId);
    if (!matchId) return null;
    return activeMatches.get(matchId) || null;
  }

  async startMatch(playerOne, playerTwo, topic) {
    const questions = await pickQuestionsForMatch(topic.id, QUESTION_COUNT);
    const matchId = `match_${Date.now()}_${playerOne.socketId.slice(0, 4)}`;

    const match = {
      matchId,
      topicId: topic.id,
      topicName: topic.name,
      questions,
      currentRound: 0,
      roundStartedAt: null,
      roundTimer: null,
      roundDelayTimer: null,
      countdownTimer: null,
      roundHistory: [],
      players: {
        [playerOne.socketId]: {
          socketId: playerOne.socketId,
          nickname: playerOne.nickname,
          userId: playerOne.userId || null,
          score: 0,
          correctCount: 0,
          answered: false,
          lastAnswer: null
        },
        [playerTwo.socketId]: {
          socketId: playerTwo.socketId,
          nickname: playerTwo.nickname,
          userId: playerTwo.userId || null,
          score: 0,
          correctCount: 0,
          answered: false,
          lastAnswer: null
        }
      }
    };

    activeMatches.set(matchId, match);
    socketToMatch.set(playerOne.socketId, matchId);
    socketToMatch.set(playerTwo.socketId, matchId);

    this.io.to(playerOne.socketId).emit('match:found', {
      opponentNickname: playerTwo.nickname,
      topicName: topic.name
    });
    this.io.to(playerTwo.socketId).emit('match:found', {
      opponentNickname: playerOne.nickname,
      topicName: topic.name
    });

    this.startCountdown(match);
  }

  startCountdown(match) {
    const socketIds = Object.keys(match.players);
    let step = PRE_MATCH_COUNTDOWN_SEC;

    const emitCount = (count) => {
      socketIds.forEach((socketId) => {
        const opponent = Object.values(match.players).find((entry) => entry.socketId !== socketId);

        this.io.to(socketId).emit('match:countdown', {
          count,
          opponentNickname: opponent.nickname,
          topicName: match.topicName
        });
      });
    };

    const scheduleNext = () => {
      if (step > 0) {
        emitCount(step);
        step -= 1;
        match.countdownTimer = setTimeout(scheduleNext, 1000);
        return;
      }

      socketIds.forEach((socketId) => {
        this.io.to(socketId).emit('match:go');
      });
      this.startRound(match);
    };

    scheduleNext();
  }

  buildRoundSummary(match, socketId) {
    const opponent = Object.values(match.players).find((entry) => entry.socketId !== socketId);

    return match.roundHistory.map((round, index) => ({
      questionNumber: index + 1,
      questionText: round.questionText,
      yourPoints: round.results[socketId]?.points ?? 0,
      opponentPoints: round.results[opponent.socketId]?.points ?? 0,
      yourCorrect: round.results[socketId]?.isCorrect ?? false,
      opponentCorrect: round.results[opponent.socketId]?.isCorrect ?? false
    }));
  }

  startRound(match) {
    if (match.roundTimer) {
      clearTimeout(match.roundTimer);
      match.roundTimer = null;
    }

    const question = match.questions[match.currentRound];
    match.roundStartedAt = Date.now();

    Object.values(match.players).forEach((player) => {
      player.answered = false;
      player.lastAnswer = null;
    });

    Object.keys(match.players).forEach((socketId) => {
      this.io.to(socketId).emit('round:start', {
        questionIndex: match.currentRound,
        totalQuestions: match.questions.length,
        topicName: match.topicName,
        startedAt: match.roundStartedAt,
        question: {
          text: question.text,
          imageUrl: question.imageUrl || null,
          options: question.options
        },
        scores: this.getScores(match, socketId)
      });
    });

    match.roundTimer = setTimeout(() => {
      this.endRound(match);
    }, TIME_LIMIT_MS);
  }

  submitAnswer(socketId, selectedIndex) {
    const match = this.getMatchForSocket(socketId);
    if (!match || match.roundStartedAt === null) return;

    const player = match.players[socketId];
    if (!player || player.answered) return;

    const question = match.questions[match.currentRound];
    const elapsedMs = Date.now() - match.roundStartedAt;
    const isCorrect = selectedIndex === question.correctIndex;
    const points = scoreAnswer({ isCorrect, timeMs: elapsedMs });

    player.answered = true;
    player.lastAnswer = {
      selectedIndex,
      isCorrect,
      points,
      elapsedMs
    };

    if (isCorrect) {
      player.correctCount += 1;
    }
    player.score += points;

    Object.keys(match.players).forEach((otherSocketId) => {
      if (otherSocketId !== socketId) {
        this.io.to(otherSocketId).emit('opponent:answered', {
          opponentScore: player.score,
          points,
          isCorrect,
          opponentNickname: player.nickname
        });
      }
    });

    if (Object.values(match.players).every((entry) => entry.answered)) {
      this.endRound(match);
    }
  }

  endRound(match) {
    if (match.roundStartedAt === null) return;

    if (match.roundTimer) {
      clearTimeout(match.roundTimer);
      match.roundTimer = null;
    }

    const question = match.questions[match.currentRound];
    match.roundStartedAt = null;

    Object.values(match.players).forEach((player) => {
      if (!player.answered) {
        player.lastAnswer = {
          selectedIndex: null,
          isCorrect: false,
          points: 0,
          elapsedMs: TIME_LIMIT_MS
        };
        player.answered = true;
      }
    });

    const playerEntries = Object.values(match.players);
    const [playerOne, playerTwo] = playerEntries;

    match.roundHistory.push({
      questionText: question.text,
      results: {
        [playerOne.socketId]: { ...playerOne.lastAnswer },
        [playerTwo.socketId]: { ...playerTwo.lastAnswer }
      }
    });

    Object.keys(match.players).forEach((socketId) => {
      const player = match.players[socketId];
      const opponent = Object.values(match.players).find((entry) => entry.socketId !== socketId);

      this.io.to(socketId).emit('round:end', {
        questionIndex: match.currentRound,
        totalQuestions: match.questions.length,
        correctIndex: question.correctIndex,
        yourAnswer: player.lastAnswer,
        opponentAnswer: opponent.lastAnswer,
        yourScore: player.score,
        yourCorrectCount: player.correctCount,
        opponentScore: opponent.score,
        opponentNickname: opponent.nickname
      });
    });

    match.currentRound += 1;

    if (match.currentRound >= match.questions.length) {
      match.roundDelayTimer = setTimeout(() => this.endMatch(match, { forfeit: false }), ROUND_DELAY_MS);
    } else {
      match.roundDelayTimer = setTimeout(() => this.startRound(match), ROUND_DELAY_MS);
    }
  }

  async endMatch(match, options = {}) {
    const { forfeit = false } = options;
    const playerEntries = Object.values(match.players);
    const [playerOne, playerTwo] = playerEntries;

    let winner = 'draw';
    if (playerOne.score > playerTwo.score) winner = playerOne.socketId;
    else if (playerTwo.score > playerOne.score) winner = playerTwo.socketId;

    const isDraw = winner === 'draw';

    try {
      await persistMatchResult(match, {
        winnerSocketId: isDraw ? 'draw' : winner,
        isDraw,
        forfeit
      });
    } catch (error) {
      console.error('Failed to persist match result:', error.message);
    }

    Object.keys(match.players).forEach((socketId) => {
      const player = match.players[socketId];
      const opponent = playerEntries.find((entry) => entry.socketId !== socketId);

      this.io.to(socketId).emit('match:end', {
        winner,
        isDraw: winner === 'draw',
        youWin: winner === socketId,
        yourScore: player.score,
        yourCorrectCount: player.correctCount,
        opponentScore: opponent.score,
        opponentNickname: opponent.nickname,
        topicName: match.topicName,
        roundSummary: this.buildRoundSummary(match, socketId)
      });
    });

    this.cleanupMatch(match);
  }

  handleDisconnect(socketId) {
    const match = this.getMatchForSocket(socketId);
    if (!match) return;

    const opponentEntry = Object.values(match.players).find((player) => player.socketId !== socketId);
    if (opponentEntry) {
      persistMatchResult(match, {
        winnerSocketId: opponentEntry.socketId,
        isDraw: false,
        forfeit: true
      }).catch((error) => {
        console.error('Failed to persist forfeit match:', error.message);
      });

      this.io.to(opponentEntry.socketId).emit('match:end', {
        winner: opponentEntry.socketId,
        isDraw: false,
        youWin: true,
        forfeit: true,
        yourScore: opponentEntry.score,
        yourCorrectCount: opponentEntry.correctCount,
        opponentScore: match.players[socketId].score,
        opponentNickname: match.players[socketId].nickname,
        topicName: match.topicName,
        roundSummary: this.buildRoundSummary(match, opponentEntry.socketId)
      });
    }

    this.cleanupMatch(match);
  }

  cleanupMatch(match) {
    if (match.roundTimer) clearTimeout(match.roundTimer);
    if (match.roundDelayTimer) clearTimeout(match.roundDelayTimer);
    if (match.countdownTimer) clearTimeout(match.countdownTimer);

    Object.keys(match.players).forEach((socketId) => {
      socketToMatch.delete(socketId);
    });

    activeMatches.delete(match.matchId);
  }

  getScores(match, socketId) {
    const player = match.players[socketId];
    const opponent = Object.values(match.players).find((entry) => entry.socketId !== socketId);

    return {
      you: player.score,
      opponent: opponent.score
    };
  }
}
