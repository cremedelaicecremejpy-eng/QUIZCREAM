const queues = new Map();

export function removeFromAllQueues(socketId) {
  for (const [topicId, queue] of queues.entries()) {
    const nextQueue = queue.filter((player) => player.socketId !== socketId);

    if (nextQueue.length === 0) {
      queues.delete(topicId);
    } else {
      queues.set(topicId, nextQueue);
    }
  }
}

export function joinQueue(topicId, player) {
  removeFromAllQueues(player.socketId);

  if (!queues.has(topicId)) {
    queues.set(topicId, []);
  }

  const queue = queues.get(topicId);
  queue.push(player);

  if (queue.length >= 2) {
    const playerOne = queue.shift();
    const playerTwo = queue.shift();

    if (queue.length === 0) {
      queues.delete(topicId);
    }

    return [playerOne, playerTwo];
  }

  return null;
}

export function leaveQueue(socketId) {
  removeFromAllQueues(socketId);
}
