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
        // Calm, clinical palette — this is a health tool, not a game.
        clock: {
          ink: '#1b2430', // near-black text
          muted: '#5b6b7b', // secondary text
          line: '#e3e8ee', // hairlines / borders
          surface: '#ffffff',
          canvas: '#f6f8fb', // page background
          brand: '#2b6cb0', // primary (deep blue)
          brandsoft: '#ebf3fb',
          good: '#2f855a', // gains (green)
          warn: '#c05621', // caution (amber)
          bad: '#c53030', // losses (red)
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
