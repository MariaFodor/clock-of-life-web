import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Resolve the Tailwind config by this file's location rather than by process.cwd(), so the dev server
// works no matter which directory it is launched from.
const here = dirname(fileURLToPath(import.meta.url))

export default {
  plugins: [tailwindcss(join(here, 'tailwind.config.js')), autoprefixer()],
}
