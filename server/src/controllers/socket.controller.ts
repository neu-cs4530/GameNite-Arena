/* eslint no-console: "off" */

import { type GameServerSocket } from "../types.ts";

/**
 * Logs a socket error to the console
 */
export function logSocketError(socket: GameServerSocket, err: unknown) {
  if (err instanceof Error) {
    console.log(`ERR! [${socket.id}] error message: "${err.message}"`);
  } else {
    console.log(`ERR! [${socket.id}] unexpected error ${JSON.stringify(err)}`);
  }
}
