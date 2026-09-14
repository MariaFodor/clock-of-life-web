// Re-scoring unchanged answers must not append a history row.
//
// Reported by the owner from the live app: six identical rows on My Progress — same value, same day,
// "±0.0 yr since first" — beneath a sentence promising the history shows how the estimate moves AS
// THE ANSWERS CHANGE. Nothing had changed six times over.
//
// InterviewPage already guarded against this, with a comment saying exactly that, but the guard was a
// React ref: it held within one page visit and died on reload. The rule now lives in the service,
// where the history does; this pins the mock to the same behaviour so the two clients stay one seam.

import { describe, expect, it } from 'vitest'
import { createMockClient } from './mockClient'
import { SAMPLE_PROFILE } from '../test/harness'

describe('history', () => {
  it('collapses a repeat of the answers already at the top', async () => {
    const client = createMockClient()
    const ids = new Set<string>()
    for (let i = 0; i < 3; i++) ids.add((await client.estimate(SAMPLE_PROFILE)).calculation_id)

    expect(ids.size, 'three clicks, one calculation').toBe(1)
    expect(await client.listCalculations()).toHaveLength(1)
  })

  it('appends when an answer actually changes', async () => {
    const client = createMockClient()
    await client.estimate(SAMPLE_PROFILE)
    await client.estimate({ ...SAMPLE_PROFILE, waist: 112 })

    expect(await client.listCalculations()).toHaveLength(2)
  })

  it('treats a return to earlier answers as a third snapshot, not a repeat', async () => {
    const client = createMockClient()
    await client.estimate(SAMPLE_PROFILE)
    await client.estimate({ ...SAMPLE_PROFILE, waist: 112 })
    await client.estimate(SAMPLE_PROFILE)

    const rows = await client.listCalculations()
    expect(rows).toHaveLength(3)
    expect(rows[0].input_hash, 'same answers as the oldest row').toBe(rows[2].input_hash)
  })
})
