/* eslint no-console: "off" */

import express, { Router } from "express";
import { Server } from "socket.io";
import { SocketEvents } from "@gamenite/shared";
import { z } from "zod";
import * as http from "node:http";
import * as chat from "./controllers/chat.controller.ts";
import * as game from "./controllers/game.controller.ts";
import * as leaderboard from "./controllers/leaderboard.controller.ts";
import * as matchmaker from "./controllers/matchmaker.controller.ts";
import * as user from "./controllers/user.controller.ts";
import * as model from "./controllers/model.controller.ts";
import * as thread from "./controllers/thread.controller.ts";
import * as profile from "./controllers/profile.controller.ts";
import * as puzzle from "./controllers/puzzle.controller.ts";
import * as rating from "./controllers/rating.controller.ts";
import * as replay from "./controllers/replay.controller.ts";
import * as annotation from "./controllers/annotation.controller.ts";
import * as broadcast from "./controllers/broadcast.controller.ts";
import * as broadcastChat from "./controllers/broadcastChat.controller.ts";
import * as training from "./controllers/training.controller.ts";
import * as deployment from "./controllers/deployment.controller.ts";
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
        .post("/:modelId/fork", model.postFork)
        .patch("/deployment/:id", model.patchDeploymentStatus),
    )
    .use("/leaderboard", express.Router().get("/:gameKey", leaderboard.getByGame))
    .use("/matchmaker", express.Router().get("/queue", matchmaker.getQueueStatus))
    .use("/profile", express.Router().get("/:username", profile.getProfileSummary))
    .use(
      "/puzzle",
      express
        .Router()
        // NOTE: registered before "/:gameKey" or that param route shadows it.
        .get("/leaderboard", puzzle.getLeaderboard)
        .get("/:gameKey", puzzle.getToday)
        .post("/:gameKey/attempt", puzzle.postAttempt)
        .post("/:gameKey/hint", puzzle.postHint),
    )
    .use("/rating", rating.ratingRouter())
    .use(
      "/replay",
      express
        .Router()
        .get("/list", replay.getList)
        .get("/:matchId/download", replay.getDownload)
        .get("/:matchId", replay.getById)
        .post("/:matchId/view", replay.postView)
        .post("/:matchId/analysis", replay.postAnalysis),
    )
    .use(
      "/annotation",
      express.Router().post("/create", annotation.postCreate).get("/:id", annotation.getById),
    )
    .use(
      "/broadcast",
      express
        .Router()
        .post("/create", broadcast.postCreate)
        .get("/list", broadcast.getList)
        .get("/:id", broadcast.getById)
        .post("/:id/end", broadcast.postEnd)
        .post("/:id/slowmode", broadcastChat.postSlowMode),
    )
    .use("/training", training.trainingRouter())
    .use("/deployment", deployment.deploymentRouter()),
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

  socket.on("matchmakingJoin", matchmaker.socketJoinQueue(socket, io));
  socket.on("matchmakingLeave", matchmaker.socketLeaveQueue(socket, io));

  socket.on("replayWatch", replay.socketReplayWatch(socket, io));
  socket.on("replayLeave", replay.socketReplayLeave(socket, io));
  // Closed tabs never send replayLeave; broadcast corrected watcher counts
  // while the departing socket's rooms are still known.
  socket.on("disconnecting", () => replay.handleReplayDisconnecting(socket, io));

  socket.on("broadcastWatch", broadcast.socketBroadcastWatch(socket, io));
  socket.on("broadcastLeave", broadcast.socketBroadcastLeave(socket, io));
  socket.on("broadcastChatSend", broadcastChat.socketBroadcastChatSend(socket, io));

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
