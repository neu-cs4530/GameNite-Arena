import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Disclosure from "./Disclosure.tsx";

describe("Disclosure", () => {
  it("shows the body only when open", () => {
    const { rerender } = render(
      <Disclosure summary="More" open={false} onToggle={vi.fn()} testId="d">
        hidden body
      </Disclosure>,
    );
    expect(screen.queryByTestId("d-body")).not.toBeInTheDocument();

    rerender(
      <Disclosure summary="More" open={true} onToggle={vi.fn()} testId="d">
        visible body
      </Disclosure>,
    );
    expect(screen.getByTestId("d-body")).toHaveTextContent("visible body");
  });

  it("toggles to the opposite state when the header is clicked", () => {
    const onToggle = vi.fn();
    render(
      <Disclosure summary="More" open={false} onToggle={onToggle} testId="d">
        body
      </Disclosure>,
    );
    fireEvent.click(screen.getByTestId("d-toggle"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("renders the optional meta slot", () => {
    render(
      <Disclosure summary="More" meta={<span data-testid="meta" />} open={false} onToggle={vi.fn()}>
        body
      </Disclosure>,
    );
    expect(screen.getByTestId("meta")).toBeInTheDocument();
  });

  it("appends a custom className", () => {
    render(
      <Disclosure summary="More" open onToggle={vi.fn()} testId="d" className="extra">
        body
      </Disclosure>,
    );
    expect(screen.getByTestId("d").className).toContain("extra");
  });

  it("renders an open body even when no testId is given", () => {
    render(
      <Disclosure summary="More" open onToggle={vi.fn()}>
        visible body
      </Disclosure>,
    );
    expect(screen.getByText("visible body")).toBeInTheDocument();
  });
});
