// Regenerates the mock's atlas fixture FROM THE SERVICE'S OWN RESPONSE.
//
//     CLOCK_BASE=http://127.0.0.1:8099 node scripts/build-atlas-fixture.mjs
//
// The fixture is never hand-written: a mock invented in this repo is a second source of truth that
// drifts silently, which is the failure `mockScoring.parity.test.ts` exists to prevent and the one
// `atlas.parity.test.ts` was supposed to prevent here.
//
// It is stamped with the bundle it came from — version plus a digest of that manifest's checksums —
// so a bundle change turns the guard red until someone regenerates, instead of leaving a stale
// fixture that every atlas test then validates against.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const base = process.env.CLOCK_BASE ?? 'http://127.0.0.1:8080'

// Discovered, not hardcoded. This line said `model-v4.0.0` and broke the moment the service vendored
// v4.1.1 — the regeneration step that exists to unbreak the drift guard could not itself run. Same
// rule as the guard it feeds: a tool that needs hand-editing to keep working stops working.
const bundles = join(here, '..', '..', 'clock-of-life-service', 'bundle')
const bundleDir = readdirSync(bundles).filter((d) => d.startsWith('model-v')).sort().pop()
if (!bundleDir) throw new Error(`no model bundle under ${bundles} — is the service checked out beside this repo?`)
const manifestPath = join(bundles, bundleDir, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const stamp = createHash('sha256')
  .update(JSON.stringify(manifest.checksums, Object.keys(manifest.checksums).sort()))
  .digest('hex')
  .slice(0, 16)

const res = await fetch(`${base}/api/atlas`, { signal: AbortSignal.timeout(30_000) })
if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${base}/api/atlas — is the service running?`)
const atlas = await res.json()

if (atlas.model_version !== manifest.version) {
  throw new Error(
    `the service is serving model ${atlas.model_version} but the vendored bundle is ${manifest.version} — ` +
      `restart the service against the vendored bundle before regenerating`,
  )
}

const ownDigest = createHash('sha256')
  .update(JSON.stringify({ model_version: atlas.model_version, derived_by: atlas.derived_by,
                           sources: atlas.sources, countries: atlas.countries }))
  .digest('hex')
  .slice(0, 16)
const out = { _bundle: { version: manifest.version, checksums_sha256_16: stamp,
                         fixture_sha256_16: ownDigest,
                         note: 'regenerate with scripts/build-atlas-fixture.mjs when this stops matching' },
              ...atlas }
writeFileSync(join(here, '..', 'src', 'features', 'atlas', 'atlas.fixture.json'), JSON.stringify(out))
console.log(`fixture: ${atlas.countries.length} countries, bundle ${manifest.version} (${stamp})`)
