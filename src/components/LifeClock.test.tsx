import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LifeClock } from './LifeClock'

describe('<LifeClock/>', () => {
  it('renders an accessible label with the estimate and range', () => {
    render(<LifeClock age={45} estimateYears={31.2} reachesAge={76.2} interval={[29.3, 33.1]} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAccessibleName(/31\.2 more years/i)
    expect(img).toHaveAccessibleName(/range/i)
  })

  it('shows the point estimate and reaches-age caption', () => {
    render(<LifeClock age={45} estimateYears={31.2} reachesAge={76.2} interval={[29.3, 33.1]} />)
    expect(screen.getByText('31.2')).toBeInTheDocument()
    expect(screen.getByText(/age 76/i)).toBeInTheDocument()
  })
})
