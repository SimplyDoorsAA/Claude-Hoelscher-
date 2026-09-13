/* The quoter's Tailwind theme, compiled ahead of time into quoter/assets/tw.css
   by tools/build-css.sh. The page links that file; nothing is compiled in the
   browser and nothing is fetched from a CDN. Keep the theme here only. */
module.exports = {
  content: ["./quoter/index.html"],
  theme: {
    extend: {
      colors: {
        ink:    { DEFAULT: "#1c1917", soft: "#44403c", mute: "#78716c", faint: "#a8a29e" },
        paper:  { DEFAULT: "#faf9f7", card: "#ffffff", rail: "#f3f1ed", line: "#e4e0d9" },
        brass:  { DEFAULT: "#9a7b4f", deep: "#7a6039", pale: "#f3ecdf" },
        forest: { DEFAULT: "#2f4538", deep: "#22332a" }
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Georgia", "Cambria", '"Times New Roman"', "serif"],
        sans: ["Inter", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,25,23,.04), 0 8px 24px -12px rgba(28,25,23,.18)",
        lift: "0 2px 6px rgba(28,25,23,.06), 0 24px 48px -20px rgba(28,25,23,.28)",
        drawer: "-24px 0 60px -30px rgba(28,25,23,.45)"
      }
    }
  },
  corePlugins: { preflight: true }
};
