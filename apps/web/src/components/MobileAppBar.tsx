import React from "react";
import { ArrowLeft } from "lucide-react";
import { SyncDot } from "./SyncDot.js";
import { HamburgerMenu } from "./HamburgerMenu.js";

interface MobileAppBarProps {
  title: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  syncState?: "online" | "syncing" | "offline";
  showMenu?: boolean;
}

export function MobileAppBar({
  title,
  back,
  onBack,
  right,
  syncState = "online",
  showMenu = true,
}: MobileAppBarProps) {
  return (
    <header className="h-14 flex items-center gap-0 px-4 bg-card border-b border-border shrink-0 z-10">
      {back && (
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center mr-1 -ml-1.5 hover:bg-muted transition"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-[15px] font-bold text-fg tracking-tight truncate">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        <SyncDot state={syncState} />
        {right}
        {showMenu && <HamburgerMenu />}
      </div>
    </header>
  );
}
