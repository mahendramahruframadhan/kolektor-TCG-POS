import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, Loader2 } from "lucide-react";

interface CameraScannerProps {
  onScan: (text: string) => void;
}

type ScanState = "idle" | "starting" | "active" | "error";

// Unique DOM id per mount to avoid conflicts
let counter = 0;

export function CameraScanner({ onScan }: CameraScannerProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScanState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const instanceRef = useRef<Html5Qrcode | null>(null);
  const domIdRef = useRef(`qr-reader-${++counter}`);

  async function startScanner() {
    setState("starting");
    setErrorMsg(null);
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw new Error("Kamera tidak ditemukan.");

      // Prefer rear camera
      const cam = cameras.find((c) => /back|rear|environment/i.test(c.label)) ?? cameras[cameras.length - 1]!;

      const scanner = new Html5Qrcode(domIdRef.current, { verbose: false });
      instanceRef.current = scanner;

      await scanner.start(
        { deviceId: { exact: cam.id } },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          stopScanner();
          setOpen(false);
          onScan(decoded.trim().toUpperCase());
        },
        () => { /* scan attempt — not an error */ },
      );
      setState("active");
    } catch (err: unknown) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Gagal membuka kamera.");
      instanceRef.current = null;
    }
  }

  async function stopScanner() {
    if (instanceRef.current) {
      await instanceRef.current.stop().catch(() => null);
      instanceRef.current.clear();
      instanceRef.current = null;
    }
    setState("idle");
  }

  function handleToggle() {
    if (open) {
      stopScanner();
      setOpen(false);
    } else {
      setOpen(true);
    }
  }

  // Start scanning when the panel opens and the DOM node is mounted
  useEffect(() => {
    if (open && state === "idle") {
      startScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center justify-center gap-2 h-11 rounded-xl border font-bold text-sm transition ${
          open
            ? "bg-destructive bg-opacity-10 border-destructive border-opacity-40 text-destructive hover:bg-destructive hover:bg-opacity-15"
            : "bg-card border-accent border-opacity-60 text-accent hover:bg-accent hover:bg-opacity-10"
        }`}
        aria-label={open ? "Tutup kamera" : "Scan dengan kamera"}
      >
        {state === "starting" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : open ? (
          <CameraOff className="w-4 h-4" />
        ) : (
          <Camera className="w-4 h-4" />
        )}
        {open ? "Tutup Kamera" : "Scan dengan Kamera"}
      </button>

      {open && (
        <div className="rounded-2xl overflow-hidden border border-border bg-black relative">
          {state === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 gap-2">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
              <p className="text-xs text-white/70">Membuka kamera…</p>
            </div>
          )}
          {state === "error" && (
            <div className="h-32 flex flex-col items-center justify-center gap-1 px-4 text-center">
              <p className="text-xs text-destructive font-bold">{errorMsg}</p>
              <button
                onClick={startScanner}
                className="text-xs text-accent underline mt-1"
              >
                Coba lagi
              </button>
            </div>
          )}
          {/* html5-qrcode mounts into this div */}
          <div
            id={domIdRef.current}
            style={{ width: "100%", minHeight: state === "active" ? undefined : 0 }}
          />
          {state === "active" && (
            <p className="text-[10px] font-bold text-white/70 text-center py-2 bg-black/60">
              Arahkan QR/barcode kartu ke viewfinder
            </p>
          )}
        </div>
      )}
    </div>
  );
}
