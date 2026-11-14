/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd2ff",
          300: "#8eb5ff",
          400: "#5d8eff",
          500: "#3b6bf6",
          600: "#2c54e6",
          700: "#2845c9",
          800: "#283ba3",
          900: "#27367a",
        },
      },
      boxShadow: {
        xs: "0 1px 2px -1px rgba(15, 23, 42, 0.06)",
        sm: "0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.06)",
        md: "0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.06)",
        lg: "0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 8px -4px rgba(15, 23, 42, 0.06)",
      },
      maxWidth: {
        "content": "1280px",
      },
    },
  },
  plugins: [],
};