// The causal graph the model was actually constrained by, drawn from `GET /api/ontology`.
//
// This is not decoration. The single hardest thing to explain about the estimate is why "your waist
// matters" and "your waist barely moves your number" are both true — and the answer is the graph:
// waist acts THROUGH diabetes and blood pressure, so once we know those, it adds little on its own.
// Showing the arrows makes that visible instead of asking people to take it on trust.

import { useMemo, useState } from 'react'
import type { Ontology } from '../api/types'

/** Layers, upstream to downstream. Position on screen encodes position in the causal story. */
const LAYERS: Array<{ key: string; label: string; roles: string[] }> = [
  { key: 'context', label: 'Circumstance', roles: ['context', 'baseline'] },
  { key: 'lever', label: 'What you do', roles: ['lever'] },
  { key: 'manage', label: 'What it does to your body', roles: ['manage'] },
  { key: 'marker', label: 'Signs of accumulated damage', roles: ['marker'] },
]

const LABELS: Record<string, string> = {
  smk_former: 'Past smoking', smk_current: 'Smoking', cigs_day: 'Cigarettes/day',
  activity: 'Activity', sedentary: 'Sitting', sleep_long: 'Long sleep', waist: 'Waist',
  diet: 'Diet', alcohol: 'Alcohol', stress: 'Stress', sbp: 'Blood pressure',
  diabetes: 'Diabetes', high_bp: 'Hypertension', respiratory: 'Lung disease',
  mobility: 'Mobility', cvd_hx: 'Heart history', cancer_hx: 'Cancer history',
  education: 'Education', income: 'Income', env: 'Where you live',
  age: 'Age', sex: 'Sex',
}

interface Node { key: string; x: number; y: number; layer: string }

export function CausalGraph({ ontology }: { ontology: Ontology }) {
  const [focus, setFocus] = useState<string | null>(null)

  const { nodes, edges, width, height } = useMemo(() => {
    const byLayer = LAYERS.map((l) => ({
      ...l,
      keys: Object.keys(ontology).filter((k) => l.roles.includes(ontology[k].role)),
    }))
    const colW = 190
    const rowH = 40
    const width = colW * byLayer.length + 40
    const height = Math.max(...byLayer.map((l) => l.keys.length)) * rowH + 60
    const nodes: Node[] = []
    byLayer.forEach((l, li) => {
      const offset = (height - 60 - (l.keys.length - 1) * rowH) / 2
      l.keys.forEach((k, ki) => {
        nodes.push({ key: k, x: 30 + li * colW, y: 40 + offset + ki * rowH, layer: l.key })
      })
    })
    const pos = Object.fromEntries(nodes.map((n) => [n.key, n]))
    const edges = Object.entries(ontology).flatMap(([from, spec]) =>
      (spec.causes ?? [])
        .filter((to) => pos[from] && pos[to])
        .map((to) => ({ from, to })),
    )
    return { nodes, edges, width, height }
  }, [ontology])

  const pos = Object.fromEntries(nodes.map((n) => [n.key, n]))
  /** A node is lit when it is the focus or a direct neighbour of it. */
  const lit = (k: string) =>
    focus === null || focus === k ||
    (ontology[focus]?.causes ?? []).includes(k) ||
    (ontology[k]?.causes ?? []).includes(focus)

  /** An edge is lit only when it TOUCHES the focus. Lighting every edge between two neighbours of
   *  the focus (education -> income, when both merely feed waist) drowns the one path being asked
   *  about, which is the whole reason for hovering. */
  const litEdge = (from: string, to: string) => focus === null || from === focus || to === focus

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[680px] w-full"
          role="img"
          aria-label="Causal graph: how each factor reaches your estimate, and what it acts through"
        >
          <defs>
            <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4"
                    markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-clock-line/40" />
            </marker>
            <marker id="cg-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5"
                    markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-clock-brand" />
            </marker>
          </defs>

          {LAYERS.map((l, i) => (
            <text key={l.key} x={30 + i * 190} y={22} className="fill-clock-muted text-[10px] uppercase tracking-wide">
              {l.label}
            </text>
          ))}

          {[...edges]
            .sort((a, b) => Number(litEdge(a.from, a.to)) - Number(litEdge(b.from, b.to)))
            .map(({ from, to }) => {
            const a = pos[from]
            const b = pos[to]
            const on = litEdge(from, to)
            const mx = (a.x + b.x) / 2
            return (
              <path
                key={`${from}->${to}`}
                d={`M ${a.x + 74} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x - 6} ${b.y}`}
                fill="none"
                markerEnd={focus && on ? 'url(#cg-arrow-lit)' : 'url(#cg-arrow)'}
                className={
                  focus && on ? 'stroke-clock-brand'
                  : focus ? 'stroke-clock-line/10'
                  : 'stroke-clock-line/30'
                }
                strokeWidth={focus && on ? 1.6 : 0.8}
              />
            )
          })}

          {nodes.map((n) => {
            const spec = ontology[n.key]
            const on = lit(n.key)
            const isFocus = focus === n.key
            return (
              <g
                key={n.key}
                onMouseEnter={() => setFocus(n.key)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(n.key)}
                onBlur={() => setFocus(null)}
                tabIndex={0}
                role="button"
                aria-label={`${LABELS[n.key] ?? n.key}: ${spec.role}`}
                className="cursor-pointer outline-none"
                opacity={on ? 1 : 0.18}
              >
                <rect
                  x={n.x - 6} y={n.y - 12} rx={6} width={148} height={24}
                  className={
                    isFocus ? 'fill-clock-brandsoft stroke-clock-brand'
                    : spec.role === 'lever' ? 'fill-clock-good/10 stroke-clock-good/40'
                    : spec.role === 'manage' ? 'fill-clock-warn/10 stroke-clock-warn/40'
                    : 'fill-clock-canvas stroke-clock-line'
                  }
                  strokeWidth={1}
                />
                <text x={n.x + 4} y={n.y + 4} className="fill-clock-ink text-[11px]">
                  {LABELS[n.key] ?? n.key}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <p className="mt-2 text-xs text-clock-muted">
        Hover a factor to see what it acts through. Arrows are causal claims the model is built on —
        each one decides what the estimate may adjust for, which is what keeps “losing weight helps”
        from being cancelled out by the diabetes that losing weight would also improve.
      </p>

      {focus && ontology[focus] && (
        <div role="status" aria-live="polite" className="mt-3 rounded-lg border border-clock-line bg-clock-canvas p-3 text-sm">
          <strong className="text-clock-ink">{LABELS[focus] ?? focus}</strong>{' '}
          <span className="text-clock-muted">· {ontology[focus].role}</span>
          {(ontology[focus].causes ?? []).length > 0 && (
            <p className="mt-1 text-clock-muted">
              Acts through: {(ontology[focus].causes ?? []).map((c) => LABELS[c] ?? c).join(', ')}
            </p>
          )}
          {ontology[focus].decision && <p className="mt-1 text-clock-muted">{ontology[focus].decision}</p>}
          {ontology[focus].prior?.doi && (
            <a
              className="mt-1 inline-block text-clock-brand underline"
              href={ontology[focus].prior!.url ?? `https://doi.org/${ontology[focus].prior!.doi}`}
              target="_blank"
              rel="noreferrer"
            >
              {ontology[focus].prior!.first_author} {ontology[focus].prior!.year} — read the paper
            </a>
          )}
        </div>
      )}
    </div>
  )
}
