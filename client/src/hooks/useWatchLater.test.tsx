import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { lsKeys } from "../util/consts.ts";
import useWatchLater from "./useWatchLater.ts";

// The store re-reads localStorage whenever this event fires, so the tests use
// it to exercise the parsing branches in `readSet`.
const CHANGED_EVENT = "ga:watchLater:changed";

function setStored(value: string | null): void {
  if (value === null) window.localStorage.removeItem(lsKeys.watchLater);
  else window.localStorage.setItem(lsKeys.watchLater, value);
  act(() => {
    window.dispatchEvent(new Event(CHANGED_EVENT));
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("useWatchLater", () => {
  it("toggle adds an id, then removes it on a second toggle", () => {
    const { result } = renderHook(() => useWatchLater());

    act(() => result.current.toggle("m1"));
    expect(result.current.has("m1")).toBe(true);
    expect(result.current.ids).toContain("m1");

    act(() => result.current.toggle("m1"));
    expect(result.current.has("m1")).toBe(false);
  });

  it("clear empties the set", () => {
    const { result } = renderHook(() => useWatchLater());
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));

    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
  });

  it("reads a stored array and keeps only the string entries", () => {
    const { result } = renderHook(() => useWatchLater());
    // The `3` is not a string, so it should be filtered out.
    setStored(JSON.stringify(["x", "y", 3]));
    expect(result.current.ids.sort()).toEqual(["x", "y"]);
  });

  it("falls back to an empty set on invalid JSON", () => {
    const { result } = renderHook(() => useWatchLater());
    setStored("{not valid json");
    expect(result.current.ids).toEqual([]);
  });

  it("falls back to an empty set when the stored value isn't an array", () => {
    const { result } = renderHook(() => useWatchLater());
    setStored(JSON.stringify({ nope: true }));
    expect(result.current.ids).toEqual([]);
  });

  it("treats a missing value as an empty set", () => {
    const { result } = renderHook(() => useWatchLater());
    setStored(JSON.stringify(["keep"]));
    setStored(null);
    expect(result.current.ids).toEqual([]);
  });
});
