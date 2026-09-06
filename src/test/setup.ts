import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { provideClient } from '../api/client'
import { createMockClient } from '../api/mockClient'

// jsdom has no matchMedia; default to "reduced motion" so animations resolve to their final state
// synchronously in tests. Individual tests can override window.matchMedia if they need the animated path.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// A default client so any component that queries at import/render time has one; individual tests can
// override with their own fake via provideClient / the harness.
provideClient(createMockClient())

afterEach(() => {
  cleanup()
})
