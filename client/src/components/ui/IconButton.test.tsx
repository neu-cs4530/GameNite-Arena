import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import IconButton from "./IconButton.tsx";

describe("IconButton", () => {
  it("renders the icon and forwards aria-label + onClick", () => {
    const onClick = vi.fn();
    render(<IconButton icon="×" aria-label="Close" onClick={onClick} />);
    const button = screen.getByLabelText("Close");
    expect(button).toHaveTextContent("×");

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("adds the active modifier class when active", () => {
    render(<IconButton icon="★" aria-label="Star" active />);
    expect(screen.getByLabelText("Star").className).toContain("ga-icon-button--active");
  });

  it("defaults to type=button", () => {
    render(<IconButton icon="★" aria-label="Star" />);
    expect(screen.getByLabelText("Star")).toHaveAttribute("type", "button");
  });
});
