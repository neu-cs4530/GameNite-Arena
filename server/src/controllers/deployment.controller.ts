/**
 * server/src/controllers/deployment.controller.ts
 * =================================================
 * Read-only deployment views, mounted at /api/deployment via
 * deploymentRouter() (tests mount the identical router).
 *
 *   GET /api/deployment/list?username=   newest-first populated views
 *
 * Mutations (deploy, pause/resume/retire) live in model.controller.ts.
 */

import express from "express";
import type { DeploymentViewListPage } from "@gamenite/shared";
import { type RestAPI } from "../types.ts";
import { listDeploymentViews } from "../services/deploymentList.service.ts";

/** GET /api/deployment/list?username= */
export const getList: RestAPI<DeploymentViewListPage> = async (req, res) => {
  const username =
    typeof req.query.username === "string" && req.query.username !== ""
      ? req.query.username
      : undefined;
  res.send(await listDeploymentViews({ username }));
};

export function deploymentRouter(): express.Router {
  return express.Router().get("/list", getList);
}
