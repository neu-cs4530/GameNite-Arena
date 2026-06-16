import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterBar from "./FilterBar.tsx";

function renderBar(props: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const onClear = props.onClear ?? vi.fn();
  return render(
    <FilterBar onClear={onClear} {...props}>
      {props.children ?? <span data-testid="child">child</span>}
    </FilterBar>,
  );
}

describe("FilterBar", () => {
  it("renders with default (collapsed) state and no panel visible", () => {
    renderBar();
    expect(screen.queryByTestId("filter-bar-panel")).not.toBeInTheDocument();
  });

  it("opens the panel when the Filters toggle is clicked", () => {
    renderBar();
    fireEvent.click(screen.getByTestId("filter-toggle"));
    expect(screen.getByTestId("filter-bar-panel")).toBeInTheDocument();
  });

  it("closes the panel when the × (close) button is clicked", () => {
    renderBar({ defaultOpen: true });
    expect(screen.getByTestId("filter-bar-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("filter-close"));
    expect(screen.queryByTestId("filter-bar-panel")).not.toBeInTheDocument();
  });

  it("shows the active-filter badge when activeCount > 0", () => {
    renderBar({ activeCount: 3 });
    expect(screen.getByTestId("filter-active-count")).toHaveTextContent("3");
  });

  it("does NOT show the active-filter badge when activeCount is 0", () => {
    renderBar({ activeCount: 0 });
    expect(screen.queryByTestId("filter-active-count")).not.toBeInTheDocument();
  });

  it("shows Clear-all when clearable=true even with activeCount=0", () => {
    renderBar({ clearable: true, activeCount: 0 });
    expect(screen.getByTestId("filter-clear-all")).toBeInTheDocument();
  });

  it("hides Clear-all when clearable=false", () => {
    renderBar({ clearable: false, activeCount: 5 });
    expect(screen.queryByTestId("filter-clear-all")).not.toBeInTheDocument();
  });

  it("calls onClear when Clear-all is clicked", () => {
    const onClear = vi.fn();
    renderBar({ onClear, clearable: true });
    fireEvent.click(screen.getByTestId("filter-clear-all"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders presets slot above the header", () => {
    renderBar({ presets: <span data-testid="preset-slot">Presets</span> });
    expect(screen.getByTestId("filter-bar-presets")).toBeInTheDocument();
    expect(screen.getByTestId("preset-slot")).toBeInTheDocument();
  });

  it("renders the compactSummary in the header area", () => {
    renderBar({ compactSummary: <span data-testid="summary">42 results</span> });
    expect(screen.getByTestId("summary")).toBeInTheDocument();
  });

  it("when collapsible=false the panel is always visible and no toggle is shown", () => {
    renderBar({ collapsible: false });
    expect(screen.getByTestId("filter-bar-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-toggle")).not.toBeInTheDocument();
  });

  it("controlled mode: open=true shows panel, open=false hides it", () => {
    const { rerender } = renderBar({ open: true, onToggle: vi.fn() });
    expect(screen.getByTestId("filter-bar-panel")).toBeInTheDocument();

    rerender(
      <FilterBar open={false} onToggle={vi.fn()} onClear={vi.fn()}>
        <span />
      </FilterBar>,
    );
    expect(screen.queryByTestId("filter-bar-panel")).not.toBeInTheDocument();
  });

  it("controlled mode: clicking toggle calls onToggle with the next boolean", () => {
    const onToggle = vi.fn();
    renderBar({ open: false, onToggle });
    fireEvent.click(screen.getByTestId("filter-toggle"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("shows singular 'filter applied' in footer when activeCount=1", () => {
    renderBar({ defaultOpen: true, activeCount: 1 });
    expect(screen.getByText("1 filter applied")).toBeInTheDocument();
  });

  it("shows plural 'filters applied' in footer when activeCount > 1", () => {
    renderBar({ defaultOpen: true, activeCount: 4 });
    expect(screen.getByText("4 filters applied")).toBeInTheDocument();
  });

  it("shows 'No filters applied' in the footer when activeCount=0", () => {
    renderBar({ defaultOpen: true, activeCount: 0 });
    expect(screen.getByText("No filters applied")).toBeInTheDocument();
  });

  it("Done button closes the panel (collapsible mode)", () => {
    renderBar({ defaultOpen: true });
    fireEvent.click(screen.getByText("Done"));
    expect(screen.queryByTestId("filter-bar-panel")).not.toBeInTheDocument();
  });

  it("Done button calls onClear (non-collapsible mode)", () => {
    const onClear = vi.fn();
    renderBar({ collapsible: false, onClear });
    fireEvent.click(screen.getByText("Clear all"));
    expect(onClear).toHaveBeenCalled();
  });
});
