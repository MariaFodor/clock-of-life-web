// Generates the World surface's country boundaries: Natural Earth polygons, projected offline into
// SVG paths. Run it, review the diff, commit the output — never hand-edit the generated files.
//
//     node scripts/build-geometry.mjs
//
// Boundaries only. The mortality numbers this map colours come from the service (`GET /api/atlas`),
// derived from the model bundle's own life tables, so that the map and the Life Clock cannot disagree
// — they are the same integrator over the same table. A second copy of mortality data in the front end
// is exactly the drift this project has been removing everywhere else.
//
// What projecting here buys: no map library ships to the client, and no third-party request is made
// while someone is reading their own health estimate.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'features', 'atlas', 'data')

// Natural Earth boundaries. The TAG is only a label for humans: `raw.githubusercontent.com` resolves
// a ref at request time, and a tag is a mutable pointer the upstream owner can force-move. So the
// fetch uses the commit the tag pointed at, and the bytes are checked against a digest recorded here.
//
// This is not paranoia about Natural Earth. Every shape is keyed purely on upstream property strings
// (`isoOf` below), so whoever controls those strings controls which mortality number colours which
// landmass — a one-character edit reassigns a territory, and the only control standing between that
// and a shipped map is someone reading a diff of a very large JSON file.
const NE_TAG = 'v5.1.2'
const NE_COMMIT = 'f1890d9f152c896d250a77557a5751a93d494776'
const NE_SHA256 = {
  '110m': '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
  '50m': '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb',
}
const MAX_BYTES = 40 * 1024 * 1024
const NE = (res) =>
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_${res}_admin_0_countries.geojson`

async function getNaturalEarth(res) {
  const url = NE(res)
  // A total deadline, not just the stall timeout undici applies per chunk: a server trickling bytes
  // steadily keeps that one resetting forever.
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  const declared = Number(response.headers.get('content-length'))
  if (declared > MAX_BYTES) throw new Error(`${url} declares ${declared} bytes, over the ${MAX_BYTES} ceiling`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) throw new Error(`${url} sent ${bytes.byteLength} bytes, over the ceiling`)
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  if (digest !== NE_SHA256[res]) {
    throw new Error(`ne_${res} is not the file this map was built from.\n  expected ${NE_SHA256[res]}\n  got      ${digest}\n` +
      `If Natural Earth genuinely published a correction, update NE_COMMIT and NE_SHA256 together and ` +
      `review the regenerated diff country by country.`)
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

// ── Projections ───────────────────────────────────────────────────────────────
// Both are EQUAL-AREA. A choropleth colours areas, so a projection that inflates them (Mercator,
// which triples Europe against Africa) is drawing a different claim than the data makes.

const rad = (deg) => (deg * Math.PI) / 180

/** Equal Earth (Šavrič, Patterson & Jenny 2018), the world view. */
function equalEarth([lon, lat]) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796
  const M = Math.sqrt(3) / 2
  const t = Math.asin(M * Math.sin(rad(lat)))
  const t2 = t * t, t6 = t2 * t2 * t2, t8 = t6 * t2
  const x = (rad(lon) * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + 7 * A3 * t6 + 9 * A4 * t8))
  const y = t * (A1 + A2 * t2 + A3 * t6 + A4 * t8)
  return [x, y]
}

/** Lambert azimuthal equal-area at 52°N 10°E — the ETRS89-LAEA grid Europe is normally drawn on. */
function laeaEurope([lon, lat]) {
  const p1 = rad(52), l0 = rad(10)
  const p = rad(lat), dl = rad(lon) - l0
  const denom = 1 + Math.sin(p1) * Math.sin(p) + Math.cos(p1) * Math.cos(p) * Math.cos(dl)
  const k = Math.sqrt(2 / Math.max(denom, 1e-9))
  return [k * Math.cos(p) * Math.sin(dl), k * (Math.cos(p1) * Math.sin(p) - Math.sin(p1) * Math.cos(p) * Math.cos(dl))]
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Sutherland–Hodgman against a lon/lat window — how the Europe view gets Russia's European half
 *  instead of a country that reaches Kamchatka and drags the whole frame east. */
function clipRing(ring, [w, s, e, n]) {
  const edges = [
    [(p) => p[0] >= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n]],
  ]
  let out = ring
  for (const [inside, cross] of edges) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length]
      const curIn = inside(cur), prevIn = inside(prev)
      if (curIn) {
        if (!prevIn) out.push(cross(prev, cur))
        out.push(cur)
      } else if (prevIn) out.push(cross(prev, cur))
    }
    if (out.length === 0) return []
  }
  return out
}

/** Ramer–Douglas–Peucker, run in projected units so the tolerance means "pixels of the viewBox". */
function simplify(points, tol) {
  if (points.length < 3) return points
  let maxD = 0, idx = 0
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1]
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD <= tol) return [points[0], points[points.length - 1]]
  return [...simplify(points.slice(0, idx + 1), tol).slice(0, -1), ...simplify(points.slice(idx), tol)]
}

const ringArea = (r) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]
  return Math.abs(a / 2)
}

const polygons = (geom) =>
  geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []

/**
 * One view: clip → project → simplify → fit to a viewBox → SVG path per country.
 *
 * Only outer rings are kept. Holes are enclaves (Lesotho in South Africa, San Marino in Italy) and a
 * choropleth that punches them out shows the canvas through a country that has its own colour; the
 * enclave is drawn on top by its own feature anyway.
 */
function buildView(features, { project, clip, frame, width, tolerance, minArea }) {
  const shapes = []
  for (const f of features) {
    const iso3 = isoOf(f)
    if (!iso3) continue
    const rings = []
    for (const poly of polygons(f.geometry)) {
      const outer = clip ? clipRing(poly[0], clip) : poly[0]
      if (outer.length < 4) continue
      const projected = outer.map(project)
      if (ringArea(projected) < minArea) continue
      rings.push(projected)
    }
    if (rings.length) shapes.push({ iso3, name: f.properties.NAME ?? f.properties.ADMIN, rings })
  }

  // What the reader sees. Fitting to the shapes instead would let one clipped country decide the
  // frame — the Europe view's window cuts Russia at 45°E, and an azimuthal projection turns that cut
  // into a wedge wide enough to push the rest of the continent into a corner. So the frame is the
  // region we mean to show; anything reaching past it is cropped by the SVG viewport, the way an
  // atlas crops at the edge of the page. The frame's own edges curve under projection, so they are
  // sampled rather than taken as four corners.
  const extent = frame ? frameEdge(frame).map(project) : shapes.flatMap((s) => s.rings.flat())
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of extent) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const scale = width / (maxX - minX)
  const height = Math.round((maxY - minY) * scale)
  // y is flipped: SVG counts downwards, the projections count north-up.
  const toViewBox = ([x, y]) => [(x - minX) * scale, (maxY - y) * scale]

  const countries = {}
  for (const s of shapes) {
    const d = s.rings
      .map((r) => simplify(r.map(toViewBox), tolerance))
      .filter((r) => r.length >= 3)
      // A ring entirely off-frame is invisible and unhoverable; shipping it is pure weight.
      .filter((r) => r.some(([x, y]) => x > -1 && x < width + 1 && y > -1 && y < height + 1))
      .map((r) => `M${r.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`)
      .join('')
    if (d) countries[s.iso3] = d
  }
  return { viewBox: `0 0 ${width} ${height}`, countries }
}

const round = (n) => Math.round(n * 10) / 10

/** The perimeter of a lon/lat window, sampled finely enough that its projected curve is captured. */
function frameEdge([w, s, e, n], step = 0.5) {
  const pts = []
  for (let lon = w; lon <= e; lon += step) pts.push([lon, s], [lon, n])
  for (let lat = s; lat <= n; lat += step) pts.push([w, lat], [e, lat])
  return pts
}

/** ISO_A3 is `-99` for France, Norway and a few disputed areas; ISO_A3_EH is the fixed-up field. */
function isoOf(f) {
  for (const key of ['ISO_A3_EH', 'ISO_A3', 'ADM0_A3']) {
    const v = f.properties[key]
    if (typeof v === 'string' && /^[A-Z]{3}$/.test(v) && v !== '-99') return v
  }
  return null
}

// ── Build ─────────────────────────────────────────────────────────────────────

console.log('fetching Natural Earth…')
const [ne110, ne50] = await Promise.all([getNaturalEarth('110m'), getNaturalEarth('50m')])

const world = buildView(
  // Antarctica has boundaries but no population, so it can only ever be a grey wedge — and in an
  // equal-area projection it is a wedge the width of the map. Dropping it gives the inhabited world
  // the whole frame.
  ne110.features.filter((f) => isoOf(f) !== 'ATA'),
  { project: equalEarth, width: 1000, tolerance: 0.35, minArea: 2e-5 },
)
const europe = buildView(
  // 50m, not 110m: at 110m Luxembourg and Malta do not exist, and they are EU members with data.
  ne50.features,
  {
    // Clip wide, frame narrow: countries stay whole up to the edge of the page and are cropped there.
    clip: [-45, 24, 80, 84],
    frame: [-24, 34, 42, 71],
    project: laeaEurope,
    width: 1000,
    tolerance: 0.5,
    minArea: 3e-6,
  },
)

const meta = (res, projection) => ({
  _source: `Natural Earth ${res} admin 0 countries, ${NE_TAG} (${NE_COMMIT.slice(0, 12)}) — public domain, https://www.naturalearthdata.com/about/terms-of-use/`,
  _sha256: NE_SHA256[res],
  _projection: projection,
  _generated_by: 'scripts/build-geometry.mjs',
})

// Indented one space: each country lands on its own line, so a moved border shows up as a single
// changed line naming its ISO3 code rather than as one 87 KB line nobody can review. Vite parses and
// re-serializes JSON imports, so none of this whitespace reaches the browser.
const write = (name, view, projection, res) =>
  writeFileSync(join(OUT, name), JSON.stringify({ ...meta(res, projection), ...view }, null, 1))

write('world.geo.json', world, 'Equal Earth', '110m')
write('europe.geo.json', europe, 'ETRS89-LAEA (52°N 10°E)', '50m')

console.log(`world:  ${Object.keys(world.countries).length} shapes, ${(JSON.stringify(world).length / 1024) | 0} KB, ${world.viewBox}`)
console.log(`europe: ${Object.keys(europe.countries).length} shapes, ${(JSON.stringify(europe).length / 1024) | 0} KB, ${europe.viewBox}`)
