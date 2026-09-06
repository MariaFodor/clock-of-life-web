import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sparkline } from './Sparkline'

describe('<Sparkline/>', () => {
  it('renders nothing for an empty series', () => {
    const { container } = render(<Sparkline points={[]} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws a labelled line with a marker per point and an interval band', () => {
    render(
      <Sparkline
        points={[
          { value: 30, low: 28, high: 32 },
          { value: 33, low: 31, high: 35 },
          { value: 31, low: 29, high: 33 },
        ]}
      />,
    )
    const svg = screen.getByRole('img', { name: /estimate trend/i })
    expect(svg).toBeInTheDocument()
    // one circle marker per point
    expect(svg.querySelectorAll('circle')).toHaveLength(3)
    // a band path (fill) plus the line path
    expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(2)
  })
})
