import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Anchor content globs to this file's directory so the class scan works regardless of the launch cwd.
const here = dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [join(here, 'index.html'), join(here, 'src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      colors: {
        // Calm, clinical palette — this is a health tool, not a game. Values are CSS tokens (see
        // index.css) so the whole palette swaps between light and dark themes; the rgb(... / <alpha-value>)
        // form keeps Tailwind's opacity modifiers (e.g. bg-clock-good/10) working.
        clock: {
          ink: 'rgb(var(--clock-ink) / <alpha-value>)',
          muted: 'rgb(var(--clock-muted) / <alpha-value>)',
          line: 'rgb(var(--clock-line) / <alpha-value>)',
          surface: 'rgb(var(--clock-surface) / <alpha-value>)',
          canvas: 'rgb(var(--clock-canvas) / <alpha-value>)',
          brand: 'rgb(var(--clock-brand) / <alpha-value>)',
          brandsoft: 'rgb(var(--clock-brandsoft) / <alpha-value>)',
          good: 'rgb(var(--clock-good) / <alpha-value>)',
          warn: 'rgb(var(--clock-warn) / <alpha-value>)',
          bad: 'rgb(var(--clock-bad) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
      },
    },
  },
  plugins: [],
}
