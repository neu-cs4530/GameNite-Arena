import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Pagination from "./Pagination.tsx";

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination current={1} total={1} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disables Prev on the first page and Next on the last", () => {
    const { rerender } = render(<Pagination current={1} total={3} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).toBeEnabled();

    rerender(<Pagination current={3} total={3} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("calls onChange with the clicked page number", () => {
    const onChange = vi.fn();
    render(<Pagination current={1} total={3} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Page 2"));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("marks the current page with aria-current", () => {
    render(<Pagination current={2} total={3} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Page 2")).toHaveAttribute("aria-current", "page");
  });

  it("shows first/last jumps and ellipses when the window is in the middle", () => {
    // 10 pages, on page 5 with a 3-button window → both ellipses + page 1 and 10.
    render(<Pagination current={5} total={10} onChange={vi.fn()} maxButtons={3} />);
    expect(screen.getByLabelText("Page 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Page 10")).toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(2);
  });
});
