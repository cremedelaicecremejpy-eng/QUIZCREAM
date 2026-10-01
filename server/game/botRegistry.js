// Which sockets are stand-in rivals. The game itself does not care, but the
// saved match does: a result against a stand-in should be told apart from a
// result against a person when you look at the numbers later.
//
// Ids linger for a minute after the socket goes, because a match is written to
// the database around the same moment the stand-in disconnects, and the result
// would otherwise be saved as if a person had played it.

const LINGER_MS = 60 * 1000;
const botSockets = new Map();

export function rememberBotSocket(socketId) {
  const pending = botSockets.get(socketId);
  if (pending) clearTimeout(pending);
  botSockets.set(socketId, null);
}

export function forgetBotSocket(socketId) {
  if (!botSockets.has(socketId)) return;

  const timer = setTimeout(() => botSockets.delete(socketId), LINGER_MS);
  if (typeof timer.unref === 'function') timer.unref();
  botSockets.set(socketId, timer);
}

export function isBotSocket(socketId) {
  return botSockets.has(socketId);
}

export function countBotSockets() {
  return botSockets.size;
}
