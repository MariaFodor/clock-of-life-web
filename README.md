# The Clock of Life — Web

The static SPA front end. Its job is *comprehension*: turn a statistical life-expectancy estimate into
something a person can understand and explore. In production it is served by the Rust service
(`clock-of-life-service`); there is no Node process at runtime.

Stack: **React + Vite + TypeScript**, **TanStack Query** (server-state cache), **Tailwind**, and a
hand-authored **`<LifeClock/>` SVG**. See `../architecture/web/web-architecture.md`.

## The seven surfaces (+ interview & login)

| Route | Surface | Notes |
|---|---|---|
| `/` | **My Life Clock** | estimate years / reaches-age, interval always shown |
| `/why` | **Why?** | per-factor contribution (total-effect), with evidence grades |
| `/improve` | **Improve** | recommendations — modifiable/manageable only |
| `/what-if` | **What If?** | non-persisted lever overlay (smoke / activity / sleep / waist) |
| `/relocate` | **Where Should I Live?** | compare places on PM2.5 & greenspace |
| `/progress` | **My Progress** | history of persisted `calculation` rows |
| `/stats` | **Statistics** | cohort dashboards, k ≥ 20 gated |
| `/interview` | onboarding | the questionnaire (10 sections), "why we ask" |

Login is pseudonymous (a handle only; no credentials handled in the client).

## The mock seam

Every network call goes through `src/api/client.ts` (`ApiClient`). Today it is backed by
`src/api/mockClient.ts` — a deterministic in-memory implementation whose types (`src/api/types.ts`)
**mirror the live service contract** (`estimate` / `whatif` / `calculations` / `answers` / `meta`).
Surfaces with no backend endpoint yet (Why / Improve / Relocate / Stats) are served by the same mock,
contract-shaped, so they can be built ahead of their endpoints. When the generated OpenAPI client lands,
only the client install in `src/main.tsx` changes — pages and hooks are untouched.

`src/api/mockScoring.ts` is a compact, deterministic re-implementation of the *shape* of the service's
scoring (design vector → linear predictor → relative risk centred on the reference person → remaining
years → interval). It is **not** the real model — coefficients are illustrative — but it makes What-If
deltas and "Why?" attributions behave correctly.

## Framing rules baked into the UI (ADR-001)

- The **interval is always shown** — never a bare number.
- Everything is labelled a **statistical estimate**, not a prediction or diagnosis.
- Recommendations only ever surface **modifiable / manageable** factors.
- **Safeguarding**: an estimate at/below current age is presented with care.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api → http://localhost:8080)
npm test           # vitest — a test for every page
npm run typecheck  # tsc project build, no emit
npm run build      # tsc -b && vite build → dist/
```

## Layout

```
src/
  api/         # contract types, the client seam, the mock client + mock scoring, TanStack hooks
  app/         # App shell: router, side menu, auth gate, profile context, query client
  components/  # shared UI: LifeClock SVG, FactorBar, framing components, primitives
  features/    # one folder per surface (+ interview, login), each with its own test
  test/        # setup + a providers harness (renderWithProviders)
```
