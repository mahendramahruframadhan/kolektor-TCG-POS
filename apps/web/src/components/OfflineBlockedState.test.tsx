import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBlockedState } from "./OfflineBlockedState.js";

describe("OfflineBlockedState", () => {
  it("tampilkan heading dan pesan", () => {
    render(<OfflineBlockedState />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
    expect(screen.getByText(/koneksi internet/i)).toBeInTheDocument();
  });
});
