/** @type {import("prettier").Config} */
const config = {
  semi: false,
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4 is CSS-first (no tailwind.config.js) — point the plugin at
  // the actual theme/entry stylesheet so it can sort classes correctly.
  tailwindStylesheet: "./app/globals.css",
}

export default config
