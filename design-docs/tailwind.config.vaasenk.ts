import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        vaasenk: {
          red: "#A00000",
          gold: "#FECA02",
          ember: "#C1121F",
          orange: "#FF7A18",
          coral: "#FF5C8A",
          canvas: "#FFF7EC",
          cream: "#FFFDF8",
          peach: "#FFE8D2",
          rose: "#FFE3EA",
          ink: "#231516",
          maroon: "#4A0508",
          muted: "#7A5A52",
          subtle: "#A88479",
          inverse: "#FFFFFF",
          success: "#17A75B",
          warning: "#F59E0B",
          danger: "#DC2626",
          info: "#2563EB",
        },
      },
      fontFamily: {
        vaasenk: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        "vaasenk-xs": "8px",
        "vaasenk-sm": "12px",
        "vaasenk-md": "16px",
        "vaasenk-lg": "22px",
        "vaasenk-xl": "28px",
        "vaasenk-2xl": "36px",
        "vaasenk-3xl": "44px",
        "vaasenk-full": "999px",
      },
      boxShadow: {
        "vaasenk-card-soft": "0 18px 50px rgba(74, 5, 8, 0.08), 0 2px 8px rgba(74, 5, 8, 0.05)",
        "vaasenk-card-float": "0 32px 90px rgba(160, 0, 0, 0.18), 0 8px 28px rgba(255, 122, 24, 0.10)",
        "vaasenk-glow-red": "0 0 0 1px rgba(160,0,0,0.14), 0 24px 60px rgba(160,0,0,0.24)",
        "vaasenk-glow-gold": "0 0 0 1px rgba(254,202,2,0.22), 0 18px 50px rgba(254,202,2,0.28)",
      },
      backgroundImage: {
        "vaasenk-hero": "linear-gradient(135deg, #A00000 0%, #C1121F 34%, #FF7A18 70%, #FECA02 100%)",
        "vaasenk-red-glow": "radial-gradient(circle at 50% 30%, rgba(254,202,2,0.34), transparent 30%), linear-gradient(145deg, #4A0508 0%, #A00000 48%, #FF7A18 100%)",
        "vaasenk-soft-canvas": "radial-gradient(circle at 15% 10%, rgba(254,202,2,0.28), transparent 28%), radial-gradient(circle at 82% 4%, rgba(255,92,138,0.25), transparent 30%), linear-gradient(135deg, #FFF7EC 0%, #FFE8D2 52%, #FFE3EA 100%)",
        "vaasenk-student": "linear-gradient(135deg, #FF5C8A 0%, #FF7A18 58%, #FECA02 100%)",
      },
      keyframes: {
        "vaasenk-float": {
          from: { transform: "translate3d(0,0,0) scale(1)" },
          to: { transform: "translate3d(32px,20px,0) scale(1.08)" },
        },
        "vaasenk-gradient-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "vaasenk-slide-up": {
          from: { transform: "translateY(18px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "vaasenk-float": "vaasenk-float 9s cubic-bezier(0.4,0,0.2,1) infinite alternate",
        "vaasenk-gradient-flow": "vaasenk-gradient-flow 9s cubic-bezier(0.4,0,0.2,1) infinite",
        "vaasenk-slide-up": "vaasenk-slide-up 420ms cubic-bezier(0.2,0.8,0.2,1) both",
      },
    },
  },
};

export default config;
