import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserLink from "./UserLink.tsx";

function renderLink(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("UserLink", () => {
  it("links a human to their profile", () => {
    renderLink(<UserLink name="Ada" username="ada" />);
    const link = screen.getByTestId("user-link");
    expect(link).toHaveAttribute("href", "/profile/ada");
    expect(link).toHaveTextContent("Ada");
  });

  it("links an AI to its model card", () => {
    renderLink(<UserLink name="RookieBot" type="ai" modelId="m1" />);
    expect(screen.getByTestId("model-link")).toHaveAttribute("href", "/models/m1");
  });

  it("renders plain text when a human has no username", () => {
    renderLink(<UserLink name="Anon" />);
    expect(screen.getByTestId("user-link-plain")).toHaveTextContent("Anon");
  });

  it("lets children override the name", () => {
    renderLink(
      <UserLink name="Ada" username="ada">
        <strong>custom</strong>
      </UserLink>,
    );
    expect(screen.getByTestId("user-link")).toHaveTextContent("custom");
  });

  it("adds the subtle modifier class when asked", () => {
    renderLink(<UserLink name="Ada" username="ada" subtle />);
    expect(screen.getByTestId("user-link").className).toContain("ga-userlink--subtle");
  });
});
