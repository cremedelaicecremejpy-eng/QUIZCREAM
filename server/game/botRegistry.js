// Which live sockets are stand-in rivals. The game itself does not care, but
// the saved match does: a result against a stand-in should be told apart from
// a result against a person when you look at the numbers later.

const botSockets = new Set();

export function rememberBotSocket(socketId) {
  botSockets.add(socketId);
}

export function forgetBotSocket(socketId) {
  botSockets.delete(socketId);
}

export function isBotSocket(socketId) {
  return botSockets.has(socketId);
}

export function countBotSockets() {
  return botSockets.size;
}
