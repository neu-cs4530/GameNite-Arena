import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Skeleton, { SkeletonText } from "./Skeleton.tsx";

describe("Skeleton", () => {
  it("converts numeric width and height to px strings", () => {
    render(<Skeleton width={100} height={40} />);
    const el = screen.getByTestId("skeleton");
    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("40px");
  });

  it("passes string width and height through unchanged", () => {
    render(<Skeleton width="50%" height="2rem" />);
    const el = screen.getByTestId("skeleton");
    expect(el.style.width).toBe("50%");
    expect(el.style.height).toBe("2rem");
  });

  it("applies variant class", () => {
    render(<Skeleton variant="circle" />);
    expect(screen.getByTestId("skeleton").className).toContain("ga-skeleton--circle");
  });

  it("appends extra className", () => {
    render(<Skeleton className="extra" />);
    expect(screen.getByTestId("skeleton").className).toContain("extra");
  });

  it("uses custom testId", () => {
    render(<Skeleton testId="my-skeleton" />);
    expect(screen.getByTestId("my-skeleton")).toBeTruthy();
  });
});

describe("SkeletonText", () => {
  it("renders the requested number of skeleton rows", () => {
    render(<SkeletonText lines={4} />);
    // getAllByTestId because the wrapper and each child row share testid="skeleton"
    const all = screen.getAllByTestId("skeleton");
    const rows = all.filter((el) => el.className.includes("ga-skeleton--text"));
    expect(rows).toHaveLength(4);
  });

  it("defaults to 3 lines", () => {
    render(<SkeletonText />);
    const all = screen.getAllByTestId("skeleton");
    const rows = all.filter((el) => el.className.includes("ga-skeleton--text"));
    expect(rows).toHaveLength(3);
  });
});
