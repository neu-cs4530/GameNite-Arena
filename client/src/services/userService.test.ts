import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeUserInfo, UserAuth } from "@gamenite/shared";
import { api } from "./api.ts";
import { getUserById, loginUser, signupUser, updateUser } from "./userService.ts";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

const auth: UserAuth = { username: "ada", password: "pw" };
const user: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("userService.loginUser", () => {
  it("POSTs to /login and returns the user on success", async () => {
    mockedPost.mockResolvedValueOnce({ data: user });
    const result = await loginUser(auth);
    expect(mockedPost).toHaveBeenCalledWith("/api/user/login", auth);
    expect(result).toBe(user);
  });

  it("throws when the server answers with an error message", async () => {
    mockedPost.mockResolvedValueOnce({ data: { error: "bad credentials" } });
    await expect(loginUser(auth)).rejects.toThrow("bad credentials");
  });
});

describe("userService.updateUser", () => {
  it("POSTs auth + updates to /api/user/:username", async () => {
    mockedPost.mockResolvedValueOnce({ data: user });
    const result = await updateUser(auth, { display: "Ada L" });
    expect(mockedPost).toHaveBeenCalledWith("/api/user/ada", {
      auth,
      payload: { display: "Ada L" },
    });
    expect(result).toBe(user);
  });

  it("throws on an error message", async () => {
    mockedPost.mockResolvedValueOnce({ data: { error: "nope" } });
    await expect(updateUser(auth, {})).rejects.toThrow("nope");
  });
});

describe("userService.signupUser", () => {
  it("POSTs to /signup and returns the new user", async () => {
    mockedPost.mockResolvedValueOnce({ data: user });
    await expect(signupUser(auth)).resolves.toBe(user);
    expect(mockedPost).toHaveBeenCalledWith("/api/user/signup", auth);
  });

  it("throws on an error message", async () => {
    mockedPost.mockResolvedValueOnce({ data: { error: "taken" } });
    await expect(signupUser(auth)).rejects.toThrow("taken");
  });
});

describe("userService.getUserById", () => {
  it("GETs /api/user/:username and returns the user", async () => {
    mockedGet.mockResolvedValueOnce({ data: user });
    await expect(getUserById("ada")).resolves.toBe(user);
    expect(mockedGet).toHaveBeenCalledWith("/api/user/ada");
  });

  it("throws on an error message", async () => {
    mockedGet.mockResolvedValueOnce({ data: { error: "no user" } });
    await expect(getUserById("ghost")).rejects.toThrow("no user");
  });
});
