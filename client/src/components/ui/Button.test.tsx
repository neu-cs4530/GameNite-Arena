import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "./Button.tsx";

describe("Button", () => {
  it("renders its label and the left icon when not loading", () => {
    render(
      <Button leftIcon={<span data-testid="left" />} rightIcon={<span data-testid="right" />}>
        Go
      </Button>,
    );
    expect(screen.getByText("Go")).toBeInTheDocument();
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();
  });

  it("shows a spinner, hides icons, and disables while loading", () => {
    render(
      <Button
        loading
        leftIcon={<span data-testid="left" />}
        rightIcon={<span data-testid="right" />}
      >
        Go
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("right")).not.toBeInTheDocument();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Go</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("adds the full-width modifier class when fullWidth is set", () => {
    render(<Button fullWidth>Go</Button>);
    expect(screen.getByRole("button").className).toContain("ga-button--full");
  });
});
