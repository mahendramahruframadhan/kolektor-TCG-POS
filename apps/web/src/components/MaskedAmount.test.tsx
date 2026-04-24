import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaskedAmount } from "./MaskedAmount.js";

describe("MaskedAmount", () => {
  it("renders masked by default", () => {
    render(<MaskedAmount amount={50000} />);
    expect(screen.getByText(/••••••/)).toBeInTheDocument();
  });

  it("reveals amount on click", () => {
    render(<MaskedAmount amount={50000} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(screen.getByText(/Rp\s*50\.000/)).toBeInTheDocument();
  });

  it("shows placeholder for undefined amount", () => {
    render(<MaskedAmount amount={undefined} />);
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
