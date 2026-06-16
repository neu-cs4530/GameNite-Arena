import { beforeEach, describe, expect, it } from "vitest";
import { CommentRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { createComment, populateCommentInfo } from "../../src/services/comment.service.ts";
import type { UserWithId } from "../../src/types.ts";

let user0: UserWithId;

beforeEach(async () => {
  const u0 = await getUserByUsername("user0");
  if (!u0) throw new Error("seeded user missing");
  user0 = u0;
});

describe("comment.service", () => {
  it("creates a comment with no editedAt", async () => {
    const created = await createComment(user0, "nice move", new Date("2026-06-01T00:00:00Z"));
    expect(created.text).toBe("nice move");
    expect(created.createdBy.username).toBe("user0");
    // A brand-new comment has never been edited.
    expect(created.editedAt).toBeUndefined();
  });

  it("surfaces editedAt as a Date when the stored comment has one", async () => {
    // Seed a record that was edited (createComment never sets editedAt).
    const id = await CommentRepo.add({
      text: "edited later",
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: user0.userId,
      editedAt: "2026-06-02T00:00:00.000Z",
    });
    const info = await populateCommentInfo(id);
    expect(info.editedAt).toBeInstanceOf(Date);
    expect(info.editedAt?.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});
