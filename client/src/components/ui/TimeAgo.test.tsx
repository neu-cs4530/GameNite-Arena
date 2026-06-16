import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeContext } from "../../contexts/TimeContext.tsx";
import TimeAgo from "./TimeAgo.tsx";

// Render with a fixed "now" so the relative text is deterministic.
function renderAt(now: Date, date: string | Date): HTMLElement {
  render(
    <TimeContext.Provider value={now}>
      <TimeAgo date={date} testId="t" />
    </TimeContext.Provider>,
  );
  return screen.getByTestId("t");
}

describe("TimeAgo", () => {
  it("carries the full ISO timestamp in dateTime and title", () => {
    const el = renderAt(new Date("2026-06-10T00:00:00Z"), "2026-06-09T00:00:00Z");
    expect(el).toHaveAttribute("dateTime", "2026-06-09T00:00:00.000Z");
    expect(el).toHaveAttribute("title", "2026-06-09T00:00:00.000Z");
  });

  it("renders a relative 'ago' string for a past date", () => {
    const el = renderAt(new Date("2026-06-10T00:00:00Z"), "2026-06-09T00:00:00Z");
    expect(el).toHaveTextContent(/ago/i);
  });

  it("shows 'just now' when the date is in the future relative to now", () => {
    const el = renderAt(new Date("2026-06-10T00:00:00Z"), "2026-06-11T00:00:00Z");
    expect(el).toHaveTextContent(/just now/i);
  });

  it("accepts a Date object as well as a string", () => {
    const el = renderAt(new Date("2026-06-10T00:00:00Z"), new Date("2026-06-09T00:00:00Z"));
    expect(el).toHaveAttribute("dateTime", "2026-06-09T00:00:00.000Z");
  });

  it("falls back to dayjs fromNow when context has no fixed 'now'", () => {
    render(
      <TimeContext.Provider value={null as unknown as Date}>
        <TimeAgo date="2026-06-09T00:00:00Z" testId="t" />
      </TimeContext.Provider>,
    );
    // With no fixed now, it still renders a relative string (the !now branch).
    expect(screen.getByTestId("t").textContent).toBeTruthy();
  });
});
