import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          void: "#050507",
          deep: "#08080a",
          primary: "#0b0b0e",
          surface: "#141418",
          "surface-hover": "#1c1c22",
          elevated: "#24242c",
        },
        accent: {
          DEFAULT: "#5040ff",
          hover: "#7366ff",
          muted: "rgba(80, 64, 255, 0.15)",
          glow: "#968cff",
          secondary: "#5040ff",
          warm: "#f59e0b",
        },
        text: {
          primary: "#f0f0f5",
          secondary: "#8888a0",
          muted: "#55556a",
        },
        border: {
          DEFAULT: "#1e1e24",
          hover: "#2a2a32",
          accent: "rgba(80, 64, 255, 0.25)",
        },
        status: {
          success: "#10b981",
          error: "#f43f5e",
          warning: "#f59e0b",
          running: "#5040ff",
        },
        nebula: {
          50: "#eeedff",
          100: "#dcd9ff",
          200: "#b9b2ff",
          300: "#968cff",
          400: "#7366ff",
          500: "#5040ff",
          600: "#4033cc",
          700: "#302699",
          800: "#201a66",
          900: "#100d33",
          950: "#08061a",
        },
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        body: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        glow: "0 0 12px rgba(80, 64, 255, 0.08)",
        "glow-lg": "0 0 24px rgba(80, 64, 255, 0.12)",
        "glow-sm": "0 0 6px rgba(80, 64, 255, 0.06)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.4)",
        "glass-sm": "0 4px 16px rgba(0, 0, 0, 0.3)",
        float: "0 20px 60px rgba(0, 0, 0, 0.5)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2s linear infinite",
        indeterminate: "indeterminate 1.5s ease-in-out infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        indeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(80, 64, 255, 0.06)" },
          "50%": { boxShadow: "0 0 14px rgba(80, 64, 255, 0.12)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
}

export default config
