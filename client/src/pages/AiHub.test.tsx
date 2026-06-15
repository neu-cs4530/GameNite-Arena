import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AiHub from "./AiHub.tsx";

function renderHub(): void {
  render(
    <MemoryRouter initialEntries={["/ai"]}>
      <Routes>
        <Route path="/ai" element={<AiHub />} />
        <Route path="/trainer" element={<div data-testid="trainer-page-stub" />} />
        <Route path="/models" element={<div data-testid="models-page-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AiHub", () => {
  it("renders a tile for Trainer and Models", () => {
    renderHub();
    expect(screen.getByTestId("ai-hub-tile-trainer")).toBeInTheDocument();
    expect(screen.getByTestId("ai-hub-tile-models")).toBeInTheDocument();
  });

  it("navigates to /trainer when the Trainer tile is clicked", async () => {
    renderHub();
    await userEvent.click(screen.getByTestId("ai-hub-tile-trainer"));
    expect(screen.getByTestId("trainer-page-stub")).toBeInTheDocument();
  });

  it("navigates to /models when the Models tile is clicked", async () => {
    renderHub();
    await userEvent.click(screen.getByTestId("ai-hub-tile-models"));
    expect(screen.getByTestId("models-page-stub")).toBeInTheDocument();
  });
});
