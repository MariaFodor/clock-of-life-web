import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { provideClient } from '../api/client'
import { createMockClient } from '../api/mockClient'

// A default client so any component that queries at import/render time has one; individual tests can
// override with their own fake via provideClient / the harness.
provideClient(createMockClient())

afterEach(() => {
  cleanup()
})
