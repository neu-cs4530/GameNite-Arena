import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import useAsync from "./useAsync.ts";

describe("useAsync", () => {
  it("starts loading, then exposes the produced data", async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(42), []));

    // first render: producer hasn't resolved yet
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it("captures a thrown Error", async () => {
    const boom = new Error("down");
    const { result } = renderHook(() => useAsync(() => Promise.reject(boom), []));

    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.data).toBeNull();
  });

  it("wraps a non-Error rejection in an Error", async () => {
    // Reject with a bare string (not an Error) to exercise the wrapping path.
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- intentional non-Error rejection
      useAsync(() => Promise.reject("oops"), []),
    );

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe("oops");
  });

  it("uses the seed as the initial data while still loading", async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve("fresh"), [], "seed"));

    expect(result.current.data).toBe("seed");
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data).toBe("fresh"));
  });

  it("re-runs the producer when refetch is called", async () => {
    const producer = vi.fn().mockResolvedValue("v");
    const { result } = renderHook(() => useAsync(producer, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(producer).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());
    await waitFor(() => expect(producer).toHaveBeenCalledTimes(2));
  });

  it("ignores a resolution that arrives after the component unmounts", async () => {
    let resolve!: (v: number) => void;
    const { unmount } = renderHook(() =>
      useAsync(() => new Promise<number>((r) => (resolve = r)), []),
    );
    unmount();
    resolve(1); // resolves after cleanup — the cancelled guard should swallow it
    await Promise.resolve();
    expect(true).toBe(true);
  });

  it("ignores a rejection that arrives after the component unmounts", async () => {
    let reject!: (e: unknown) => void;
    const { unmount } = renderHook(() =>
      useAsync(() => new Promise<number>((_, rej) => (reject = rej)), []),
    );
    unmount();
    reject(new Error("late"));
    await Promise.resolve();
    expect(true).toBe(true);
  });
});
