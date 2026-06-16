import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SearchInput from "./SearchInput.tsx";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchInput", () => {
  it("commits to the parent only after the debounce delay", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} label="Search" debounceMs={200} testId="q" />);

    fireEvent.change(screen.getByTestId("q"), { target: { value: "bot" } });
    // Nothing committed yet — still inside the debounce window.
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenCalledWith("bot");
  });

  it("shows the live keystrokes immediately in the input", () => {
    render(<SearchInput value="" onChange={vi.fn()} label="Search" testId="q" />);
    fireEvent.change(screen.getByTestId("q"), { target: { value: "ab" } });
    expect(screen.getByTestId("q")).toHaveValue("ab");
  });

  it("re-syncs the local value when the parent resets it", () => {
    const { rerender } = render(
      <SearchInput value="old" onChange={vi.fn()} label="Search" testId="q" />,
    );
    expect(screen.getByTestId("q")).toHaveValue("old");

    // Parent clears the filter — the input should follow.
    rerender(<SearchInput value="" onChange={vi.fn()} label="Search" testId="q" />);
    expect(screen.getByTestId("q")).toHaveValue("");
  });
});
