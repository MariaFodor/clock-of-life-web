import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { StatsPage } from './StatsPage'
import { renderWithProviders } from '../../test/harness'

describe('<StatsPage/>', () => {
  it('renders cohort rows and reports means for large cohorts', async () => {
    renderWithProviders(<StatsPage />)
    expect(await screen.findByText('Age 30–39')).toBeInTheDocument()
    expect(screen.getByText('47.8 yr')).toBeInTheDocument()
  })

  it('suppresses cohorts smaller than 20 (k-anonymity)', async () => {
    renderWithProviders(<StatsPage />)
    expect(await screen.findByText('Age 80+')).toBeInTheDocument()
    expect(screen.getByText(/hidden \(k < 20\)/i)).toBeInTheDocument()
  })
})
