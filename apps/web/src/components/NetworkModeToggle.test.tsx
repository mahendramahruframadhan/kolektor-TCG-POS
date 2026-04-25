import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useSyncStateStore } from "../store/sync-state.js";
import { NetworkModeToggle } from "./NetworkModeToggle.js";

beforeEach(() => {
  useSyncStateStore.setState({ networkMode: "auto" });
});

describe("NetworkModeToggle", () => {
  it('render tombol "Auto" saat mode auto', () => {
    render(<NetworkModeToggle />);
    expect(screen.getByRole("button", { name: /auto/i })).toBeInTheDocument();
  });

  it("buka dropdown saat diklik", () => {
    render(<NetworkModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /auto/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("set force-offline saat opsi Mode Offline diklik", () => {
    render(<NetworkModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /auto/i }));
    fireEvent.click(screen.getByText(/mode offline/i));
    expect(useSyncStateStore.getState().networkMode).toBe("force-offline");
  });

  it('tampilkan "Offline" saat mode force-offline', () => {
    useSyncStateStore.setState({ networkMode: "force-offline" });
    render(<NetworkModeToggle />);
    expect(screen.getByRole("button", { name: /offline/i })).toBeInTheDocument();
  });
});
