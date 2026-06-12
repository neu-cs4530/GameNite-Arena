import { withAuth } from "@gamenite/shared";
import { z } from "zod";
import { type AnnotationInfo } from "../models.ts";
import { checkAuth } from "../services/auth.service.ts";
import { createAnnotation, getAnnotationById } from "../services/annotation.service.ts";
import { type RestAPI } from "../types.ts";

/**
 * Body schema for creating an annotation. Author, visibility, and timestamps
 * are set server-side from the authenticated user, so they aren't accepted
 * here. The marker values mirror `AnnotationMarker` in models.ts.
 */
const zCreateAnnotation = z.object({
  matchId: z.string().min(1),
  moveIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  marker: z.enum(["good", "interesting", "questionable", "bad", "winning"]).optional(),
});

/**
 * Handle POST requests to `/api/annotation/create` that store a new annotation
 * on a move of a replay.
 */
export const postCreate: RestAPI<AnnotationInfo> = async (req, res) => {
  const body = withAuth(zCreateAnnotation).safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  res.send(await createAnnotation(user, body.data.payload, new Date()));
};

/**
 * Handle GET requests to `/api/annotation/:id`. Returns either 404 or the
 * annotation info object.
 */
export const getById: RestAPI<AnnotationInfo, { id: string }> = async (req, res) => {
  const annotation = await getAnnotationById(req.params.id);
  if (!annotation) {
    res.status(404).send({ error: "Annotation not found" });
    return;
  }

  res.send(annotation);
};
