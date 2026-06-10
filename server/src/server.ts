// Run this script to launch the server.
/* eslint no-console: "off" */

import { KeyvMongo } from "@keyv/mongo";
import express from "express";
import { Keyv } from "keyv";
import * as path from "node:path";
import "dotenv/config";
import { app, httpServer, io } from "./app.ts";
import { createTrainingProgressBridge } from "./services/trainingAdapters.service.ts";
import { resetEverythingToDefaults } from "./initRepository.ts";
import { createRepo, setDbInitializer } from "./keyv.ts";
import { trainingProcessor } from "./services/trainingWorker.ts";
import { registerTrainingWorker } from "./services/trainingQueue.service.ts";
import { scheduleDailyPuzzleJob, registerPuzzleWorker } from "./services/puzzleQueue.service.ts";

// If a MONGO_STR environment variable is given (or set in `server/.env`),
// then use MongoDB to create the repository.
const MONGO_STR = process.env.MONGO_STR || null;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "GameNite";
if (MONGO_STR) {
  setDbInitializer(<T>(name: string) => {
    const mongoConnection = new KeyvMongo(MONGO_STR, { collection: name, db: MONGO_DB_NAME });
    return new Keyv<T>(mongoConnection);
  });
}

// We only want to initialize the database once, so we check whether
// we've set the INIT_KEY before. If the INIT_KEY is set, then don't
// initialize the database anew.
const INIT_KEY = "is_initialized";
const InitRepo = createRepo<{ exists: true; time: string }>("init");
const initialized = await InitRepo.find(INIT_KEY);
if (!initialized) {
  await resetEverythingToDefaults();
  await InitRepo.set(INIT_KEY, { exists: true, time: new Date().toISOString() });
}

// This if-then-else check for MODE=production helps avoid a common source of
// pain:
//
// 1. You build the website (`npm run build`) and test it in production mode
// 2. You want to update the frontend, so you start the Vite development
//    server and edit code
// 3. You don't realize you have the *Express* server open in your browser,
//    serving stale files created during the build command in step #1.
//    You can't get any frontend changes to show up in the browser, no
//    matter what you do.
if (process.env.MODE === "production") {
  // In production mode, we want to serve the frontend code from Express
  app.use(express.static(path.join(import.meta.dirname, "../../client/dist")));
  app.get(/(.*)/, (req, res) =>
    res.sendFile(path.join(import.meta.dirname, "../../client/dist/index.html")),
  );
} else {
  app.get("/", (req, res) => {
    res.send(
      "You are connecting directly to the API server in development mode! " +
        "You probably want to look elsewhere for the Vite frontend.",
    );
    res.end();
  });
}

// wire up the daily puzzle cron and start the worker
await scheduleDailyPuzzleJob();
registerPuzzleWorker();

// start the training progress bridge (subscribes to Redis, registers socket handlers)
await createTrainingProgressBridge(io);

// Actually start the server
const PORT = parseInt(process.env.PORT || "8000");
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  registerTrainingWorker(trainingProcessor);
});
