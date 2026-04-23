import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Tag, QrCode, Zap, Star } from "lucide-react";
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
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-accent-fg" />
          </div>
          <span className="text-2xl font-extrabold text-primary-fg tracking-tight">
            KolektaPOS
          </span>
        </div>
        <p className="text-xs text-primary-fg opacity-50 tracking-widest uppercase font-bold mt-1">
          Booth · Pokémon TCG
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
              Kasir offline-first untuk booth Pokémon TCG di konvensi Indonesia
            </p>
          </div>

          {/* ── Illustration placeholder 1:1 ── */}
          <div className="aspect-square w-full rounded-3xl overflow-hidden relative bg-surface flex items-center justify-center mb-6 border border-border">
            {/* Background gradient blobs */}
            <div
              className="absolute w-48 h-48 rounded-full bg-accent opacity-10"
              style={{ top: "10%", left: "-10%" }}
            />
            <div
              className="absolute w-36 h-36 rounded-full bg-primary opacity-10"
              style={{ bottom: "5%", right: "-5%" }}
            />

            {/* Floating decoration: top-right star */}
            <div className="absolute top-5 right-6 text-accent opacity-30">
              <Star className="w-5 h-5 fill-current" />
            </div>
            {/* Floating decoration: bottom-left star */}
            <div className="absolute bottom-8 left-5 text-accent opacity-20">
              <Star className="w-3.5 h-3.5 fill-current" />
            </div>
            {/* Floating decoration: top-left dot */}
            <div className="absolute top-8 left-8 w-3 h-3 rounded-full bg-primary opacity-15" />
            {/* Floating decoration: bottom-right dot */}
            <div className="absolute bottom-6 right-10 w-4 h-4 rounded-full bg-accent opacity-15" />

            {/* Center content */}
            <div className="flex flex-col items-center gap-5 z-10">
              {/* Icon cluster */}
              <div className="relative">
                {/* Main large icon */}
                <div className="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center shadow-lg">
                  <ShoppingCart className="w-12 h-12 text-primary-fg" />
                </div>
                {/* Floating mini icon: QR */}
                <div
                  className="absolute -top-3 -right-4 w-10 h-10 rounded-2xl bg-accent flex items-center justify-center shadow-md"
                >
                  <QrCode className="w-5 h-5 text-accent-fg" />
                </div>
                {/* Floating mini icon: Tag */}
                <div
                  className="absolute -bottom-3 -left-4 w-9 h-9 rounded-xl bg-card border-2 border-border flex items-center justify-center shadow-sm"
                >
                  <Tag className="w-4 h-4 text-accent" />
                </div>
                {/* Floating mini icon: Zap */}
                <div
                  className="absolute top-1 -left-5 w-8 h-8 rounded-xl bg-muted flex items-center justify-center shadow-sm"
                >
                  <Zap className="w-4 h-4 text-muted-fg" />
                </div>
              </div>

              {/* Placeholder label */}
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
                  Ilustrasi
                </p>
                <p className="text-xs text-muted-fg opacity-60">placeholder 1:1</p>
              </div>
            </div>
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
              className="w-full h-14 bg-accent text-accent-fg font-extrabold text-base rounded-full hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
              style={{ boxShadow: "0 8px 24px hsla(265,100%,60%,0.35)" }}
            >
              Mulai →
            </button>
            <p className="text-center text-[11px] text-muted-fg mt-3">
              KolektaPOS · Khusus internal
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
