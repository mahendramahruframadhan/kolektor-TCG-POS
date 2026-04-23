import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.js";

export function LandingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Already authenticated → skip landing, go straight to dashboard
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-primary flex flex-col select-none">
      {/* ── Top: brand header ── */}
      <div className="flex flex-col items-center justify-center pt-14 pb-10 px-6">
        <div className="flex items-center gap-2.5 mb-1">
          <img src="/favicon.png" alt="KolektaPOS" className="w-9 h-9 rounded-xl object-cover" />
          <span className="text-2xl font-extrabold text-primary-fg tracking-tight">
            KolektaPOS
          </span>
        </div>
        <p className="text-xs text-primary-fg opacity-50 tracking-widest uppercase font-bold mt-1">
          Booth · TCG Sales
        </p>
      </div>

      {/* ── Bottom: content card ── */}
      <div className="flex-1 bg-card rounded-t-[32px] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex-1 flex flex-col max-w-sm mx-auto w-full px-6 pt-8 pb-8">
          {/* Title + subtitle */}
          <div className="text-center mb-6">
            <h1 className="text-[26px] font-extrabold text-fg leading-tight">
              Siap untuk berdagang!
            </h1>
            <p className="text-muted-fg text-sm mt-2 leading-relaxed">
              Kasir offline-first untuk booth TCG Sales di konvensi Indonesia
            </p>
          </div>

          {/* ── Hero image ── */}
          <div className="aspect-square w-full rounded-3xl overflow-hidden relative bg-surface flex items-center justify-center mb-6">
            <img
              src="/hero.webp"
              alt="KolektaPOS Hero"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>

          {/* Feature chips */}
          <div className="flex justify-center gap-2 flex-wrap mb-8">
            {["Offline 100%", "Scan QR", "Multi pemilik"].map((label) => (
              <span
                key={label}
                className="text-[10px] font-extrabold tracking-widest uppercase px-3 py-1.5 rounded-full bg-muted text-muted-fg border border-border"
              >
                {label}
              </span>
            ))}
          </div>

          {/* CTA button — push to bottom */}
          <div className="mt-auto">
            <button
              onClick={() => navigate("/login")}
              className="w-full h-14 bg-accent text-accent-fg font-extrabold text-base rounded-2xl hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
              style={{ boxShadow: "0 8px 24px hsla(265,100%,60%,0.35)" }}
            >
              Mulai →
            </button>
            <p className="text-center text-[11px] text-muted-fg mt-3">
              KolektaPOS · Revota © 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
