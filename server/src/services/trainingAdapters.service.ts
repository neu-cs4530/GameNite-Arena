// Wires the bridge to real ioredis + socket.io. only file that touches them directly.
// everything else works through the small interfaces in trainingProgress.types.ts.
// call createTrainingProgressBridge(io) once in server.ts after the socket server is up.

import { type Server } from "socket.io";
import { createRedisConnection } from "./redis.ts";
import { TrainingProgressBridge } from "./trainingBridge.service.ts";

export async function createTrainingProgressBridge(
  // accepts any Server generic shape; the bridge only uses to() and on("connection")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io: Server<any, any>,
): Promise<TrainingProgressBridge> {
  // subscriber needs its own connection, a subscribed client can't run normal commands.
  // a second connection handles the snapshot GETs.
  const subscriberClient = createRedisConnection();
  const snapshotClient = createRedisConnection();

  const bridge = new TrainingProgressBridge({
    subscriber: {
      subscribe: async (channel) => {
        await subscriberClient.subscribe(channel);
      },
      onMessage: (handler) => {
        subscriberClient.on("message", handler);
      },
    },
    emitter: {
      to: (room) => ({
        emit: (event, payload) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          (io.to(room) as any).emit(event, payload);
        },
      }),
    },
    snapshots: {
      get: (key) => snapshotClient.get(key),
    },
  });

  await bridge.start();
  io.on("connection", (socket) => bridge.registerClient(socket));
  return bridge;
}
