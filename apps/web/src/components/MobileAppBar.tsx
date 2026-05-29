import React from "react";
import { ArrowLeft } from "lucide-react";
import { SyncDot } from "./SyncDot.js";
import { HamburgerMenu } from "./HamburgerMenu.js";
import { NetworkModeToggle } from "./NetworkModeToggle.js";
import { useAuthStore } from "../store/auth.js";

interface MobileAppBarProps {
  title: string;
  logo?: React.ReactNode;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  syncButton?: React.ReactNode;
  showMenu?: boolean;
  showNetworkToggle?: boolean;
}

export function MobileAppBar({
  title,
  logo,
  back,
  onBack,
  right,
  syncButton,
  showMenu = true,
  showNetworkToggle = false,
}: MobileAppBarProps) {
  const user = useAuthStore((s) => s.user);
  const showToggle = showNetworkToggle || user?.role === "admin";

  return (
    <header className="sticky top-0 h-14 flex items-center gap-0 px-4 bg-card border-b border-border shrink-0 z-10">
      {back && (
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center mr-1 -ml-1.5 hover:bg-muted transition"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0 flex items-center">
        {logo ? (
          logo
        ) : (
          <h1 className="text-[15px] font-bold text-fg tracking-tight truncate">
            {title}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-1.5 ml-2 shrink-0">
        <SyncDot />
        {syncButton}
        {showToggle && <NetworkModeToggle />}
        {right}
        {showMenu && <HamburgerMenu />}
      </div>
    </header>
  );
}
