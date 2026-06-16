import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Section from "./Section.tsx";

describe("Section", () => {
  it("renders the header when a title is given", () => {
    render(
      <Section title="Stats" subtitle="last 7 days" actions={<button>Edit</button>}>
        body
      </Section>,
    );
    expect(screen.getByRole("heading", { name: "Stats" })).toBeInTheDocument();
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("omits the header entirely when there is no title/subtitle/actions", () => {
    render(<Section testId="s">just a body</Section>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("just a body")).toBeInTheDocument();
  });

  it("exposes an aria-label when provided", () => {
    render(
      <Section testId="s" ariaLabel="Recent games">
        body
      </Section>,
    );
    expect(screen.getByTestId("s")).toHaveAttribute("aria-label", "Recent games");
  });
});
