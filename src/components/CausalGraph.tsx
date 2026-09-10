// The causal graph the model was actually constrained by, drawn from `GET /api/ontology`.
//
// This is not decoration. The single hardest thing to explain about the estimate is why "your waist
// matters" and "your waist barely moves your number" are both true — and the answer is the graph:
// waist acts THROUGH diabetes and blood pressure, so once we know those, it adds little on its own.
// Showing the arrows makes that visible instead of asking people to take it on trust.

import { useMemo, useState } from 'react'
import type { Ontology } from '../api/types'
import { ArticleLink } from './ArticleLink'

/** Role decides COLOUR, never position — position is computed from the graph itself (see below). */
const ROLE_STYLE: Record<string, string> = {
  lever: 'fill-clock-good/10 stroke-clock-good/40',
  manage: 'fill-clock-warn/10 stroke-clock-warn/40',
  marker: 'fill-clock-bad/10 stroke-clock-bad/30',
}

const LABELS: Record<string, string> = {
  smk_former: 'Past smoking', smk_current: 'Smoking', cigs_day: 'Cigarettes/day',
  activity: 'Activity', sedentary: 'Sitting', sleep_long: 'Long sleep', waist: 'Waist',
  diet: 'Diet', alcohol: 'Alcohol', stress: 'Stress', sbp: 'Blood pressure',
  diabetes: 'Diabetes', high_bp: 'Hypertension', respiratory: 'Lung disease',
  mobility: 'Mobility', cvd_hx: 'Heart history', cancer_hx: 'Cancer history',
  education: 'Education', income: 'Income', env: 'Where you live',
  age: 'Age', sex: 'Sex',
}

/**
 * Longest-path layering: a node sits one column right of its furthest-upstream cause.
 *
 * Grouping columns by ROLE instead looks tidier and is a lie — against the real ontology it buries
 * 10 edges inside a single column (every `diet -> waist`, `activity -> waist`, `education -> income`)
 * and sends 11 more backwards, including smoking to heart history. Those are exactly the mediation
 * paths this drawing exists to show. Depth is computed from the graph, so every arrow points forward
 * by construction and the picture cannot contradict the model.
 */
function depths(ontology: Ontology): Record<string, number> {
  const parents: Record<string, string[]> = {}
  Object.keys(ontology).forEach((k) => (parents[k] = []))
  for (const [from, spec] of Object.entries(ontology)) {
    for (const to of spec.causes ?? []) if (parents[to]) parents[to].push(from)
  }
  const depth: Record<string, number> = {}
  const visit = (k: string, seen: Set<string>): number => {
    if (depth[k] !== undefined) return depth[k]
    if (seen.has(k)) return 0 // defensive: the model's gates guarantee acyclicity; never loop here
    seen.add(k)
    const d = parents[k].length === 0 ? 0 : 1 + Math.max(...parents[k].map((p) => visit(p, seen)))
    seen.delete(k)
    depth[k] = d
    return d
  }
  Object.keys(ontology).forEach((k) => visit(k, new Set()))
  return depth
}

interface Node { key: string; x: number; y: number; col: number }

export function CausalGraph({ ontology }: { ontology: Ontology }) {
  const [focus, setFocus] = useState<string | null>(null)

  const { nodes, edges, width, height } = useMemo(() => {
    const depth = depths(ontology)
    const maxDepth = Math.max(0, ...Object.values(depth))
    const byCol: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
    Object.keys(ontology).forEach((k) => byCol[depth[k]].push(k))
    // Inside a column, group by role so colour still reads as a band.
    const ORDER = ['baseline', 'context', 'lever', 'manage', 'marker']
    byCol.forEach((col) => col.sort((a, b) =>
      ORDER.indexOf(ontology[a].role) - ORDER.indexOf(ontology[b].role) || a.localeCompare(b)))

    const colW = 178
    const rowH = 34
    const width = colW * byCol.length + 30
    const height = Math.max(1, ...byCol.map((c) => c.length)) * rowH + 56
    const nodes: Node[] = []
    byCol.forEach((col, ci) => {
      const offset = (height - 56 - (col.length - 1) * rowH) / 2
      col.forEach((k, ki) => {
        nodes.push({ key: k, x: 20 + ci * colW, y: 40 + offset + ki * rowH, col: ci })
      })
    })
    const posLocal = Object.fromEntries(nodes.map((n) => [n.key, n]))
    const edges = Object.entries(ontology).flatMap(([from, spec]) =>
      (spec.causes ?? []).filter((to) => posLocal[from] && posLocal[to]).map((to) => ({ from, to })),
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
          // The viewBox is as wide as the graph is deep (7 columns on the real ontology), so the minimum
          // width has to follow it — otherwise a phone squeezes 1276 units into 375px and the labels
          // render at ~6px. The wrapper already scrolls horizontally.
          className="min-w-[1180px] w-full"
          role="group"
          aria-label="Causal graph: how each factor reaches your estimate, and what it acts through"
        >
          <defs>
            <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4"
                    markerHeight="4" orient="auto-start-reverse">
              {/* Matched to the edge: a head at a lower alpha than its line reads as a fading
                  arrow, and at 55% it was 2.22:1 in light mode — under the bar the line now clears. */}
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-clock-muted" />
            </marker>
            <marker id="cg-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5"
                    markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-clock-brand" />
            </marker>
          </defs>

          <text x={20} y={20} className="fill-clock-muted text-[10px] uppercase tracking-wide">
            causes
          </text>
          <text x={width - 130} y={20} className="fill-clock-muted text-[10px] uppercase tracking-wide">
            consequences
          </text>

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
                d={`M ${a.x + 144} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x - 8} ${b.y}`}
                fill="none"
                markerEnd={focus && on ? 'url(#cg-arrow-lit)' : 'url(#cg-arrow)'}
                className={
                  focus && on ? 'stroke-clock-brand'
                  : focus ? 'stroke-clock-line/20'
                  // At rest the arrows ARE the content — they carry the mediation claim this whole
                  // drawing exists to make. `clock-line` is a hairline tuned for card borders: at
                  // 30% over this Card's own `clock-surface` (rgb(23,30,39) dark) it composites to
                  // rgb(28,35,45), a contrast ratio of 1.06:1, at 0.8px. The graph rendered as a
                  // list of chips in columns and no edge was visible until you hovered.
                  //
                  // Full opacity, not a diluted one. WCAG 1.4.11 asks 3:1 of a graphical object you
                  // need in order to understand the content, which these are; muted at 45% gives
                  // 2.47:1 dark and 1.89:1 light, so it clears neither. At 100% it is 6.93:1 and
                  // 5.25:1 — the same legibility the token already earns as body text, which is the
                  // whole reason for borrowing it. LifeClock's arc does the same thing.
                  : 'stroke-clock-muted'
                }
                strokeWidth={focus && on ? 1.8 : 1.1}
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
                onClick={() => setFocus(focus === n.key ? null : n.key)}
                tabIndex={0}
                aria-label={`${LABELS[n.key] ?? n.key}: ${spec.role}`}
                className="cursor-pointer"
                opacity={on ? 1 : 0.18}
              >
                <rect
                  x={n.x - 6} y={n.y - 11} rx={6} width={150} height={22}
                  className={
                    isFocus
                      ? 'fill-clock-brandsoft stroke-clock-brand'
                      : (ROLE_STYLE[spec.role] ?? 'fill-clock-canvas stroke-clock-line')
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

      {/* The container is always mounted and only its contents change: a live region inserted
          together with its text is routinely missed by screen readers. */}
      <div role="status" aria-live="polite" className="mt-3 min-h-[1.5rem] text-sm">
        {focus && ontology[focus] && (
        <div className="rounded-lg border border-clock-line bg-clock-canvas p-3">
          <strong className="text-clock-ink">{LABELS[focus] ?? focus}</strong>{' '}
          <span className="text-clock-muted">· {ontology[focus].role}</span>
          {(ontology[focus].causes ?? []).length > 0 && (
            <p className="mt-1 text-clock-muted">
              Acts through: {(ontology[focus].causes ?? []).map((c) => LABELS[c] ?? c).join(', ')}
            </p>
          )}
          {ontology[focus].decision && <p className="mt-1 text-clock-muted">{ontology[focus].decision}</p>}
          {ontology[focus].prior && (
            <div className="mt-1">
              <ArticleLink
                url={ontology[focus].prior!.url}
                doi={ontology[focus].prior!.doi}
                firstAuthor={ontology[focus].prior!.first_author}
                year={ontology[focus].prior!.year}
                citation={ontology[focus].prior!.title}
              />
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
