/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "theme-bg": "rgb(var(--bg-primary-rgb) / <alpha-value>)",
        "theme-text": "rgb(var(--text-primary-rgb) / <alpha-value>)",
        "theme-accent": "rgb(var(--accent-yellow-rgb) / <alpha-value>)",
        "theme-accent-hover": "rgb(var(--accent-yellow-hover-rgb) / <alpha-value>)",
        "theme-icon": "rgb(var(--icon-color-rgb) / <alpha-value>)",
        "theme-card": "rgb(var(--card-bg-rgb) / <alpha-value>)",
        "theme-card-border": "rgb(var(--card-border-rgb) / <alpha-value>)",
      },
    },
  },
  plugins: [],
}
