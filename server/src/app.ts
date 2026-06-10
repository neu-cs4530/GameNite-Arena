/* eslint no-console: "off" */

import express, { Router } from "express";
import { Server } from "socket.io";
import { SocketEvents } from "@gamenite/shared";
import { z } from "zod";
import * as http from "node:http";
import * as chat from "./controllers/chat.controller.ts";
import * as game from "./controllers/game.controller.ts";
import * as leaderboard from "./controllers/leaderboard.controller.ts";
import * as user from "./controllers/user.controller.ts";
import * as model from "./controllers/model.controller.ts";
import * as thread from "./controllers/thread.controller.ts";
import * as puzzle from "./controllers/puzzle.controller.ts";
import * as replay from "./controllers/replay.controller.ts";
import * as training from "./controllers/training.controller.ts";
import { type GameServer } from "./types.ts";

export const app = express();
export const httpServer = http.createServer(app);
export const io: GameServer = new Server(httpServer);

app.use(express.json());

app.use(
  "/api",
  Router()
    .use(
      "/game",
      express
        .Router() //
        .post("/create", game.postCreate)
        .get("/list", game.getList)
        .get("/:id", game.getById),
    )
    .use(
      "/thread",
      express
        .Router() //
        .post("/create", thread.postCreate)
        .get("/list", thread.getList)
        .get("/:id", thread.getById)
        .post("/:id/comment", thread.postByIdComment),
    )
    .use(
      "/user",
      Router() // Any concrete routes here should be disallowed as usernames
        .post("/list", user.postList)
        .post("/login", user.postLogin)
        .post("/signup", user.postSignup)
        .post("/:username", user.postByUsername)
        .get("/:username", user.getByUsername),
    )
    .use(
      "/model",
      express
        .Router()
        .post("/upload", model.uploadMiddleware, model.postUpload)
        .get("/user/:username", model.getByUsername)
        .get("/:id", model.getById)
        .post("/:id/deploy", model.postDeploy)
        .patch("/deployment/:id", model.patchDeploymentStatus),
    )
    .use("/leaderboard", express.Router().get("/:gameKey", leaderboard.getByGame))
    .use(
      "/puzzle",
      express
        .Router()
        .get("/:gameKey", puzzle.getToday)
        .post("/:gameKey/attempt", puzzle.postAttempt),
    )
    .use(
      "/replay",
      express
        .Router()
        .get("/list", replay.getList)
        .get("/:matchId/download", replay.getDownload)
        .get("/:matchId", replay.getById)
        .post("/:matchId/view", replay.postView),
    )
    .use("/training", training.trainingRouter()),
);

io.on("connection", (socket) => {
  const socketId = socket.id;
  console.log(`CONN [${socketId}] connected`);

  socket.on("disconnect", () => {
    console.log(`CONN [${socketId}] disconnected`);
  });

  socket.on("chatJoin", chat.socketJoin(socket, io));
  socket.on("chatLeave", chat.socketLeave(socket, io));
  socket.on("chatSendMessage", chat.socketSendMessage(socket, io));

  socket.on("gameJoinAsPlayer", game.socketJoinAsPlayer(socket, io));
  socket.on("gameMakeMove", game.socketMakeMove(socket, io));
  socket.on("gameStart", game.socketStart(socket, io));
  socket.on("gameWatch", game.socketWatch(socket, io));

  socket.on("replayWatch", replay.socketReplayWatch(socket, io));
  socket.on("replayLeave", replay.socketReplayLeave(socket, io));
  // Closed tabs never send replayLeave; broadcast corrected watcher counts
  // while the departing socket's rooms are still known.
  socket.on("disconnecting", () => replay.handleReplayDisconnecting(socket, io));

  socket.onAny((name, payload) => {
    // The training progress bridge's events carry a bare { jobId } payload by
    // contract (trainingProgress.types.ts), not the { auth, payload } shape —
    // don't log valid bridge traffic as errors.
    if (name === SocketEvents.subscribe || name === SocketEvents.unsubscribe) {
      console.log(`RECV [${socketId}] got ${name} ${JSON.stringify(payload)}`);
      return;
    }
    const zPayload = z.object({ auth: z.object({ username: z.string() }), payload: z.any() });
    const checked = zPayload.safeParse(payload);

    if (checked.error) {
      console.log(`RECV error: ${checked.error.message}`);
    } else {
      console.log(
        `RECV [${socketId}] got ${name}${checked.data.auth.username} ${JSON.stringify(checked.data.payload)}`,
      );
    }
  });
  socket.onAnyOutgoing((name) => {
    console.log(`SEND [${socketId}] gets ${name}`);
  });
});
