import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Card from "./Card.tsx";

describe("Card", () => {
  it("is a plain surface (no button role) without onClick", () => {
    render(<Card testId="c">body</Card>);
    expect(screen.getByTestId("c")).not.toHaveAttribute("role");
  });

  it("becomes an interactive button surface when given onClick", () => {
    const onClick = vi.fn();
    render(
      <Card testId="c" onClick={onClick}>
        body
      </Card>,
    );
    const card = screen.getByTestId("c");
    expect(card).toHaveAttribute("role", "button");
    expect(card).toHaveAttribute("tabindex", "0");

    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("activates onClick with the Enter and Space keys", () => {
    const onClick = vi.fn();
    render(
      <Card testId="c" onClick={onClick}>
        body
      </Card>,
    );
    fireEvent.keyDown(screen.getByTestId("c"), { key: "Enter" });
    fireEvent.keyDown(screen.getByTestId("c"), { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("ignores key presses when not interactive", () => {
    render(<Card testId="c">body</Card>);
    // No onClick → the keydown handler returns early; nothing should happen.
    fireEvent.keyDown(screen.getByTestId("c"), { key: "Enter" });
    expect(screen.getByTestId("c")).toBeInTheDocument();
  });

  it("applies the compact density class", () => {
    render(
      <Card testId="c" density="compact">
        body
      </Card>,
    );
    expect(screen.getByTestId("c").className).toContain("ga-card--compact");
  });
});
