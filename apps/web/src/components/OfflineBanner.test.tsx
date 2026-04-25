import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner.js";

describe("OfflineBanner", () => {
  it("render dengan role alert", () => {
    render(<OfflineBanner />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("tampilkan pesan offline", () => {
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.getByText(/tidak dapat disimpan/i)).toBeInTheDocument();
  });
});
