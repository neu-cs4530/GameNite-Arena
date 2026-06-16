import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MultiToggle from "./MultiToggle.tsx";

const OPTIONS = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
] as const;

describe("MultiToggle (multi-select)", () => {
  it("adds an option that isn't selected yet", () => {
    const onChange = vi.fn();
    render(<MultiToggle value={["a"]} options={OPTIONS} onChange={onChange} label="Fruit" />);

    fireEvent.click(screen.getByText("Banana"));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("removes an option that is already selected", () => {
    const onChange = vi.fn();
    render(<MultiToggle value={["a", "b"]} options={OPTIONS} onChange={onChange} label="Fruit" />);

    fireEvent.click(screen.getByText("Apple"));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("marks the selected option as pressed", () => {
    render(<MultiToggle value={["a"]} options={OPTIONS} onChange={vi.fn()} label="Fruit" />);
    expect(screen.getByText("Apple")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Banana")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("MultiToggle (single-select)", () => {
  it("replaces the whole value with the clicked option", () => {
    const onChange = vi.fn();
    render(
      <MultiToggle
        value={["a"]}
        options={OPTIONS}
        onChange={onChange}
        label="Fruit"
        singleSelect
      />,
    );

    fireEvent.click(screen.getByText("Banana"));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("uses radio semantics (aria-checked, radiogroup)", () => {
    render(
      <MultiToggle
        value={["b"]}
        options={OPTIONS}
        onChange={vi.fn()}
        label="Fruit"
        singleSelect
        testId="fruit"
      />,
    );
    expect(screen.getByTestId("fruit")).toHaveAttribute("role", "radiogroup");
    expect(screen.getByText("Banana")).toHaveAttribute("aria-checked", "true");
  });
});
