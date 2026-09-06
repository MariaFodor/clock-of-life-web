import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Benchmark } from './Benchmark'

describe('<Benchmark/>', () => {
  it('says "above" for a positive delta', () => {
    render(<Benchmark estimateYears={40} nationalAvgYears={35} deltaYears={5} />)
    expect(screen.getByText(/above the average/i)).toBeInTheDocument()
    expect(screen.getByText(/\+5\.0 yr/)).toBeInTheDocument()
  })

  it('says "below" for a negative delta', () => {
    render(<Benchmark estimateYears={30} nationalAvgYears={35} deltaYears={-5} />)
    expect(screen.getByText(/below the average/i)).toBeInTheDocument()
  })
})
