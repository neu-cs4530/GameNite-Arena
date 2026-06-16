import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RangeSlider from "./RangeSlider.tsx";

function renderSlider(onCommitLo = vi.fn(), onCommitHi = vi.fn()) {
  render(
    <RangeSlider
      label="Elo"
      min={0}
      max={100}
      value={[20, 80]}
      onCommitLo={onCommitLo}
      onCommitHi={onCommitHi}
      format={(n) => `Elo ${n}`}
      testId="elo"
    />,
  );
  return { onCommitLo, onCommitHi };
}

describe("RangeSlider", () => {
  it("renders the formatted low–high values", () => {
    renderSlider();
    expect(screen.getByTestId("elo-range")).toHaveTextContent("Elo 20 – Elo 80");
  });

  it("commits the low handle's new value", () => {
    const { onCommitLo } = renderSlider();
    fireEvent.change(screen.getByTestId("elo-min"), { target: { value: "30" } });
    expect(onCommitLo).toHaveBeenCalledWith(30);
  });

  it("clamps the low handle so it can't cross the high handle", () => {
    const { onCommitLo } = renderSlider();
    // Dragging the min past the max (80) should clamp back down to 80.
    fireEvent.change(screen.getByTestId("elo-min"), { target: { value: "90" } });
    expect(onCommitLo).toHaveBeenCalledWith(80);
  });

  it("clamps the high handle so it can't cross the low handle", () => {
    const { onCommitHi } = renderSlider();
    // Dragging the max below the min (20) should clamp back up to 20.
    fireEvent.change(screen.getByTestId("elo-max"), { target: { value: "10" } });
    expect(onCommitHi).toHaveBeenCalledWith(20);
  });

  it("renders raw numbers when no formatter is supplied", () => {
    render(
      <RangeSlider
        label="Moves"
        min={0}
        max={100}
        value={[20, 80]}
        onCommitLo={vi.fn()}
        onCommitHi={vi.fn()}
        testId="m"
      />,
    );
    // Uses the default `(n) => \`${n}\`` formatter.
    expect(screen.getByTestId("m-range")).toHaveTextContent("20 – 80");
  });
});
