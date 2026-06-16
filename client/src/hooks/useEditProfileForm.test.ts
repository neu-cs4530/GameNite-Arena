import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SafeUserInfo } from "@gamenite/shared";
import type { GameSocket } from "../util/types.ts";
import useLoginContext from "./useLoginContext.ts";
import useAuth from "./useAuth.ts";
import { updateUser } from "../services/userService.ts";
import useEditProfileForm from "./useEditProfileForm.ts";

vi.mock("./useLoginContext.ts", () => ({ default: vi.fn() }));
vi.mock("./useAuth.ts", () => ({ default: vi.fn() }));
vi.mock("../services/userService.ts", () => ({ updateUser: vi.fn() }));

const mockedLoginContext = vi.mocked(useLoginContext);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUpdate = vi.mocked(updateUser);
const mockReset = vi.fn();

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

function fakeEvent() {
  return { preventDefault: vi.fn() } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoginContext.mockReturnValue({
    user: viewer,
    pass: "pw",
    reset: mockReset,
    socket: {} as GameSocket,
  });
  mockedUseAuth.mockReturnValue({ username: "ada", password: "pw" });
});

describe("useEditProfileForm: no-change guard", () => {
  it("sets error when nothing has changed", async () => {
    const { result } = renderHook(useEditProfileForm);
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.err).toBe("No changes to submit");
  });
});

describe("useEditProfileForm: display validation", () => {
  it("sets error when display has leading whitespace", async () => {
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setDisplay(" Ada");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.err).toMatch(/whitespace/i);
  });

  it("sets error when display is blank", async () => {
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setDisplay("");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.err).toMatch(/display name/i);
  });
});

describe("useEditProfileForm: password validation", () => {
  it("sets error when password has leading whitespace", async () => {
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setDisplay("Bob");
      result.current.setPassword(" pw");
      result.current.setConfirm(" pw");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.err).toMatch(/password.*whitespace/i);
  });

  it("sets error when passwords don't match", async () => {
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setDisplay("Bob");
      result.current.setPassword("abc");
      result.current.setConfirm("xyz");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.err).toMatch(/don't match/i);
  });
});

describe("useEditProfileForm: successful submit", () => {
  it("sends only display when only display changed", async () => {
    mockedUpdate.mockResolvedValueOnce(viewer);
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setDisplay("Bob");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(mockedUpdate).toHaveBeenCalledWith(
      { username: "ada", password: "pw" },
      { display: "Bob" },
    );
    expect(mockReset).toHaveBeenCalled();
    expect(result.current.err).toBeNull();
  });

  it("includes password in the update when it's changed", async () => {
    mockedUpdate.mockResolvedValueOnce(viewer);
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setDisplay("Bob");
      result.current.setPassword("newpw");
      result.current.setConfirm("newpw");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(mockedUpdate).toHaveBeenCalledWith(
      { username: "ada", password: "pw" },
      { display: "Bob", password: "newpw" },
    );
  });

  it("sends only password when only password changed", async () => {
    mockedUpdate.mockResolvedValueOnce(viewer);
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setPassword("newpw");
      result.current.setConfirm("newpw");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(mockedUpdate).toHaveBeenCalledWith(
      { username: "ada", password: "pw" },
      { password: "newpw" },
    );
    expect(mockReset).toHaveBeenCalled();
  });

  it("sets error from the server message when updateUser throws", async () => {
    mockedUpdate.mockRejectedValueOnce(new Error("server down"));
    const { result } = renderHook(useEditProfileForm);
    act(() => {
      result.current.setDisplay("Bob");
    });
    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.err).toContain("server down");
    expect(mockReset).not.toHaveBeenCalled();
  });
});
