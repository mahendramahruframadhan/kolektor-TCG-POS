import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "hsl(234,94%,14%)",
        "primary-fg": "hsl(40,30%,96%)",
        accent: "hsl(161,63%,46%)",
        "accent-fg": "hsl(220,60%,10%)",
        surface: "hsl(220,20%,97%)",
        card: "#ffffff",
        fg: "hsl(220,30%,10%)",
        muted: "hsl(220,15%,94%)",
        "muted-fg": "hsl(220,10%,46%)",
        border: "hsl(220,15%,90%)",
        destructive: "hsl(0,72%,51%)",
        success: "hsl(152,60%,40%)",
        warning: "hsl(38,92%,50%)",
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
