import { QueryClient } from '@tanstack/react-query'

// Server-state cache config. This client mostly reads cached server state (web-architecture.md), so
// keep data fresh-ish but avoid noisy refetches.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}
