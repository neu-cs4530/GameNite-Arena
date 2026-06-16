import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CopyField from "./CopyField.tsx";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("CopyField", () => {
  it("shows the value and a Copy button by default", () => {
    render(<CopyField value="echo hello" testId="cf" />);
    expect(screen.getByTestId("cf")).toHaveTextContent("echo hello");
    expect(screen.getByTestId("cf-copy")).toHaveTextContent("Copy");
  });

  it("copies the value and flips the button to Copied", async () => {
    render(<CopyField value="echo hello" testId="cf" />);
    await userEvent.click(screen.getByTestId("cf-copy"));
    expect(writeText).toHaveBeenCalledWith("echo hello");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("masked: hides the value and labels the button 'Copy command'", () => {
    render(<CopyField value=".venv/bin/python train.py --secret hunter2" masked testId="cf" />);
    // The ugly command must NOT be on screen.
    expect(screen.getByTestId("cf")).not.toHaveTextContent("train.py");
    expect(screen.getByTestId("cf-copy")).toHaveTextContent("Copy command");
  });

  it("masked: still copies the full hidden value on click", async () => {
    const cmd = ".venv/bin/python train.py --secret hunter2";
    render(<CopyField value={cmd} masked testId="cf" />);
    await userEvent.click(screen.getByTestId("cf-copy"));
    expect(writeText).toHaveBeenCalledWith(cmd);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("masked: accepts a custom button label", () => {
    render(<CopyField value="x" masked copyLabel="Copy run command" testId="cf" />);
    expect(screen.getByTestId("cf-copy")).toHaveTextContent("Copy run command");
  });

  it("swallows a clipboard rejection without throwing", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<CopyField value="x" testId="cf" />);
    await userEvent.click(screen.getByTestId("cf-copy"));
    // No "Copied" because the write failed, but nothing blew up.
    expect(screen.getByTestId("cf-copy")).toHaveTextContent("Copy");
  });
});
