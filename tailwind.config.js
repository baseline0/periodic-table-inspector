// Tailwind build config. The pages use the same dark strategy the Play CDN used: dark styles apply when
// <html data-theme="dark"> is set (app.js toggles it), not when the OS asks for dark.
/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./methodology.html", "./app.js", "./core.js"],
    darkMode: ["class", '[data-theme="dark"]'],
    theme: { extend: {} },
    plugins: [],
};
