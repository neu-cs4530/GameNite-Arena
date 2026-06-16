import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateRangePicker from "./DateRangePicker.tsx";

describe("DateRangePicker — preset buttons", () => {
  it("renders all 6 preset buttons", () => {
    render(<DateRangePicker value="all" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "All time" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
  });

  it("marks only the active preset", () => {
    render(<DateRangePicker value="week" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "This week" }).className).toContain(
      "ga-date-range__preset--active",
    );
    expect(screen.getByRole("button", { name: "All time" }).className).not.toContain(
      "ga-date-range__preset--active",
    );
  });

  it("calls onChange with the clicked preset and current date bounds", async () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="all" dateFrom="2026-01-01" dateTo="2026-06-01" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(onChange).toHaveBeenCalledWith("month", "2026-01-01", "2026-06-01");
  });

  it("applies the custom testId to the group", () => {
    render(<DateRangePicker value="all" onChange={vi.fn()} testId="my-picker" />);
    expect(screen.getByTestId("my-picker")).toBeInTheDocument();
  });
});

describe("DateRangePicker — custom date inputs", () => {
  it("hides date inputs when value is not custom", () => {
    render(<DateRangePicker value="all" onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/From/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/To/)).not.toBeInTheDocument();
  });

  it("shows date inputs when value is custom", () => {
    render(<DateRangePicker value="custom" onChange={vi.fn()} />);
    expect(screen.getByLabelText(/From/)).toBeInTheDocument();
    expect(screen.getByLabelText(/To/)).toBeInTheDocument();
  });

  it("populates inputs with the provided dateFrom and dateTo", () => {
    render(
      <DateRangePicker value="custom" dateFrom="2026-01-01" dateTo="2026-06-30" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/From/)).toHaveValue("2026-01-01");
    expect(screen.getByLabelText(/To/)).toHaveValue("2026-06-30");
  });

  it("passes the new From value when user changes the From input", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="custom" dateTo="2026-12-31" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/From/), { target: { value: "2026-03-01" } });
    expect(onChange).toHaveBeenCalledWith("custom", "2026-03-01", "2026-12-31");
  });

  it("passes undefined for From when the From input is cleared", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="custom" dateFrom="2026-03-01" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/From/), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("custom", undefined, undefined);
  });

  it("passes the new To value when user changes the To input", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="custom" dateFrom="2026-01-01" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/To/), { target: { value: "2026-09-30" } });
    expect(onChange).toHaveBeenCalledWith("custom", "2026-01-01", "2026-09-30");
  });

  it("passes undefined for To when the To input is cleared", () => {
    const onChange = vi.fn();
    render(<DateRangePicker value="custom" dateTo="2026-09-30" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/To/), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("custom", undefined, undefined);
  });
});
