import { expect, describe, it } from "vitest";
import { withAuth, zUserAuth } from "./auth.types.ts";
import { z } from "zod";

describe("zod's safeParse", () => {
  it("successfully parses valid input", () => {
    expect(zUserAuth.safeParse({ username: "a", password: "b" })).toStrictEqual({
      success: true,
      data: { username: "a", password: "b" },
    });
  });

  it("rejects bad inputs without exceptions", () => {
    expect(zUserAuth.safeParse(4)).toMatchObject({ success: false });
    expect(zUserAuth.safeParse({ username: 4, password: "b" })).toMatchObject({ success: false });
    expect(zUserAuth.safeParse({ username: "a" })).toMatchObject({ success: false });
  });
});

describe("zod's parse()", () => {
  it("identifies errors and raises exceptions", () => {
    const goodAuth = { username: "a", password: "b" };
    const badAuth = { username: 4, password: "b" };
    expect(withAuth(z.string()).parse({ auth: goodAuth, payload: "c" })).toStrictEqual({
      auth: goodAuth,
      payload: "c",
    });

    expect(() => withAuth(z.string()).parse({ auth: goodAuth, payload: 3 })).toThrow();
    expect(() => withAuth(z.string()).parse({ auth: badAuth, payload: "c" })).toThrow();
  });
});
