/**
 * Stub reducers for games whose live implementations are not yet shipped.
 * The replay viewer still needs *something* to dispatch on, so we expose
 * named throw-only functions that the per-game replay components can refuse
 * to render.
 */

function notImplemented(game: string): never {
  throw new Error(`${game} replays are not yet implemented`);
}

export function applyCheckersMove(): never {
  return notImplemented("Checkers");
}

export function applyConnect4Move(): never {
  return notImplemented("Connect 4");
}

export function applyTicTacToeMove(): never {
  return notImplemented("Tic-Tac-Toe");
}
