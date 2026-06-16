import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LoadMoreButton from "./LoadMoreButton.tsx";

describe("LoadMoreButton", () => {
  it("shows just 'Load more' when no remaining count is given", () => {
    render(<LoadMoreButton onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("Load more");
    expect(screen.getByRole("button")).not.toHaveTextContent("(");
  });

  it("appends the remaining count when provided", () => {
    render(<LoadMoreButton onClick={vi.fn()} remaining={12} />);
    expect(screen.getByRole("button")).toHaveTextContent("Load more (12)");
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<LoadMoreButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
