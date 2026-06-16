import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import useLoginContext from "./useLoginContext.ts";

const user: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return (
    <LoginContext.Provider value={{ user, pass: "pw", reset: () => {}, socket: {} as GameSocket }}>
      {children}
    </LoginContext.Provider>
  );
}

describe("useLoginContext", () => {
  it("returns the context when rendered inside a provider", () => {
    const { result } = renderHook(() => useLoginContext(), { wrapper });
    expect(result.current.user).toBe(user);
    expect(result.current.pass).toBe("pw");
  });

  it("throws when used outside a LoginContext provider", () => {
    expect(() => renderHook(() => useLoginContext())).toThrow("Login context is null.");
  });
});
