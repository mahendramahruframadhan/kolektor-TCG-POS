import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "hsl(256,62%,12%)",       /* dark navy-purple header */
        "primary-fg": "hsl(0,0%,100%)",    /* white on dark */
        accent: "hsl(265,100%,60%)",       /* vivid purple — buttons, checkboxes */
        "accent-fg": "hsl(0,0%,100%)",     /* white on purple */
        surface: "hsl(252,35%,97%)",       /* light lavender page bg */
        card: "#ffffff",                   /* white cards */
        fg: "hsl(256,55%,11%)",            /* near-black primary text */
        muted: "hsl(252,20%,93%)",         /* subtle lavender bg */
        "muted-fg": "hsl(252,8%,47%)",     /* medium-gray secondary text */
        border: "hsl(252,18%,88%)",        /* decorative borders, dividers */
        "border-strong": "hsl(252,18%,68%)", /* form-field edges (SC 1.4.11 ≥3:1) */
        destructive: "hsl(0,72%,51%)",     /* 4.80:1 on white — AA ✓ */
        success: "hsl(152,60%,29%)",       /* 4.56:1 on white — AA ✓ (was 40%: 3.17:1 FAIL) */
        warning: "hsl(38,92%,33%)",        /* 4.51:1 on white — AA ✓ (was 50%: 2.14:1 FAIL) */
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "20px",
      },
    },
  },
  plugins: [],
} satisfies Config;
