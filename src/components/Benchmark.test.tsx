import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Benchmark } from './Benchmark'

describe('<Benchmark/>', () => {
  it('says "above" for a positive delta, with the magnitude in plain years', () => {
    render(<Benchmark estimateYears={40} nationalAvgYears={35} deltaYears={5} />)
    expect(screen.getByText('5.0 years above')).toBeInTheDocument()
    // The magnitude is coloured and the rest is not, so the sentence is read whole here — once —
    // to prove the two halves still make one.
    expect(screen.getByText('5.0 years above').parentElement)
      .toHaveTextContent('You’re 5.0 years above the average person of your age and sex.')
  })

  it('says "below" without also printing a minus sign', () => {
    // "−0.1 yr below" states the direction twice — once in a sign the reader has to decode, once in
    // a word — and the pair reads as a double negative on the way in. The word is the one that
    // survived; the sign is what this asserts is gone.
    const { container } = render(<Benchmark estimateYears={30} nationalAvgYears={30.1} deltaYears={-0.1} />)
    expect(screen.getByText('0.1 years below')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[−-]0\.1/)
  })

  it('says "about the same as" when there is nothing between them', () => {
    render(<Benchmark estimateYears={35} nationalAvgYears={35} deltaYears={0} />)
    expect(screen.getByText('about the same as')).toBeInTheDocument()
    expect(screen.queryByText(/above|below/)).toBeNull()
  })

  it('does not announce a difference the same line has rounded away', () => {
    // Four hundredths of a year printed as "0.0 years below", in red. The words and the colour come
    // from the magnitude as shown, so a gap too small to print cannot be described as a gap.
    render(<Benchmark estimateYears={35} nationalAvgYears={35.04} deltaYears={-0.04} />)
    expect(screen.getByText('about the same as')).toBeInTheDocument()
    expect(screen.queryByText(/0\.0 years/)).toBeNull()
  })

  it('keeps the colour cue: green above, red below, neither when level', () => {
    // The colour is the fast read and the word is the precise one; they have to agree.
    const { unmount } = render(<Benchmark estimateYears={40} nationalAvgYears={35} deltaYears={5} />)
    expect(screen.getByText('5.0 years above').className).toContain('text-clock-good')
    unmount()

    const second = render(<Benchmark estimateYears={30} nationalAvgYears={35} deltaYears={-5} />)
    expect(screen.getByText('5.0 years below').className).toContain('text-clock-bad')
    second.unmount()

    render(<Benchmark estimateYears={35} nationalAvgYears={35} deltaYears={0} />)
    expect(screen.getByText('about the same as').className).toContain('text-clock-muted')
  })

  it('leaves the bars alone', () => {
    // The prose changed; the two scaled bars and their year figures did not.
    render(<Benchmark estimateYears={40} nationalAvgYears={35} deltaYears={5} />)
    expect(screen.getByText('40.0 yr')).toBeInTheDocument()
    expect(screen.getByText('35.0 yr')).toBeInTheDocument()
  })
})
