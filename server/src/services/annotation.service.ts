import { type AnnotationInfo, type AnnotationMarker } from "../models.ts";
import { type UserWithId } from "../types.ts";
import { AnnotationRepo } from "../repository.ts";

/**
 * The fields a caller supplies when creating an annotation. The author,
 * visibility, and timestamps are filled in server-side, not by the client.
 */
export interface CreateAnnotationInput {
  matchId: string;
  moveIndex: number;
  text: string;
  marker?: AnnotationMarker;
}

/**
 * Expand a stored annotation into its info object (the record plus its id).
 *
 * @param annotationId - Valid annotation id
 * @returns the expanded annotation info object
 */
async function populateAnnotationInfo(annotationId: string): Promise<AnnotationInfo> {
  const annotation = await AnnotationRepo.get(annotationId);
  return { annotationId, ...annotation };
}

/**
 * Create and store a new annotation on a move of a replay.
 *
 * @param user - The annotation's author
 * @param contents - Match/move reference, text, and optional move marker
 * @param createdAt - Creation time for this annotation
 * @returns the new annotation's info object
 */
export async function createAnnotation(
  user: UserWithId,
  { matchId, moveIndex, text, marker }: CreateAnnotationInput,
  createdAt: Date,
): Promise<AnnotationInfo> {
  const id = await AnnotationRepo.add({
    matchId,
    moveIndex,
    text,
    marker,
    authorId: user.userId,
    visibility: "private",
    createdAt: createdAt.toISOString(),
  });
  return populateAnnotationInfo(id);
}

/**
 * Retrieve a single annotation from the database.
 *
 * @param possibleAnnotationId - Ostensible annotation id
 * @returns the annotation, or null if no annotation with that id exists
 */
export async function getAnnotationById(
  possibleAnnotationId: string,
): Promise<AnnotationInfo | null> {
  const annotation = await AnnotationRepo.find(possibleAnnotationId);
  if (!annotation) return null;
  return { annotationId: possibleAnnotationId, ...annotation };
}
