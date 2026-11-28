/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: v("page"), surface: v("surface"), raised: v("raised"), line: v("line"), axis: v("axis"),
        ink: { DEFAULT: v("ink"), 2: v("ink-2"), muted: v("ink-muted") },
        brand: v("brand"),
        s1: "#3987e5", s2: "#d95926", s3: "#199e70",
        good: "#12a150", warn: "#e0a10b", serious: "#ec835a", critical: "#d03b3b",
      },
      fontFamily: { sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
