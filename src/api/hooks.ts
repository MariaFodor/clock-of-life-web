// TanStack Query hooks over the API client seam. Pages consume these, never the client directly.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getClient } from './client'
import type { AnswerInput, Profile, WhatIfChanges } from './types'

export const queryKeys = {
  meta: ['meta'] as const,
  calculations: ['calculations'] as const,
  answers: ['answers'] as const,
  locations: ['locations'] as const,
  stats: ['stats'] as const,
  why: (p: Profile | null) => ['why', p] as const,
  recommendations: (p: Profile | null) => ['recommendations', p] as const,
  benchmark: (p: Profile | null) => ['benchmark', p] as const,
}

export function useMeta() {
  return useQuery({ queryKey: queryKeys.meta, queryFn: () => getClient().getMeta() })
}

export function useCalculations() {
  return useQuery({ queryKey: queryKeys.calculations, queryFn: () => getClient().listCalculations() })
}

export function useAnswers() {
  return useQuery({ queryKey: queryKeys.answers, queryFn: () => getClient().getAnswers() })
}

/** The model's ontology — roles, causal graph, and the article behind each factor. */
export function useOntology() {
  return useQuery({
    queryKey: ['ontology'],
    queryFn: () => getClient().getOntology(),
    staleTime: Infinity, // ships with the model version; it cannot change under a running server
  })
}

export function useLocations() {
  return useQuery({ queryKey: queryKeys.locations, queryFn: () => getClient().listLocations() })
}

/**
 * The measured settlements in one country. Disabled until a country is chosen, because there is no
 * sensible "all countries" answer here — offering every settlement is how the relocate surface came to
 * show a German reader seven Romanian cities.
 */
export function usePlaces(iso3: string | null) {
  return useQuery({
    queryKey: ['places', iso3],
    queryFn: () => getClient().getPlaces(iso3!),
    staleTime: Infinity,
    enabled: Boolean(iso3),
    // A country with no measurement since 2020 answers 404, and that is a fact rather than a fault:
    // retrying it three times just delays the honest message by a second.
    retry: false,
  })
}

/** The world's life tables. Ships with the model version, so it cannot change under a session. */
export function useAtlas() {
  return useQuery({ queryKey: ['atlas'], queryFn: () => getClient().getAtlas(), staleTime: Infinity })
}

/**
 * Where the air has been measured. `enabled` is the whole point: this payload is several times the size
 * of the country table, so it is not fetched until a reader asks for the layer, and it is never fetched
 * twice because the result never goes stale — a bundle change means a new model version, not a refetch.
 */
export function useAtlasEnvironment(enabled: boolean) {
  return useQuery({
    queryKey: ['atlas', 'environment'],
    queryFn: () => getClient().getEnvironment(),
    staleTime: Infinity,
    enabled,
  })
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: () => getClient().getStats() })
}

export function useWhy(profile: Profile | null) {
  return useQuery({
    queryKey: queryKeys.why(profile),
    queryFn: () => getClient().getWhy(profile!),
    enabled: !!profile,
  })
}

export function useBenchmark(profile: Profile | null) {
  return useQuery({
    queryKey: queryKeys.benchmark(profile),
    queryFn: () => getClient().getBenchmark(profile!),
    enabled: !!profile,
  })
}

export function useRecommendations(profile: Profile | null) {
  return useQuery({
    queryKey: queryKeys.recommendations(profile),
    queryFn: () => getClient().getRecommendations(profile!),
    enabled: !!profile,
  })
}

export function useEstimate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profile: Profile) => getClient().estimate(profile),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calculations }),
  })
}

export function useWhatIf() {
  return useMutation({
    mutationFn: (args: { base: Profile; changes: WhatIfChanges; baseCalculationId?: string }) =>
      getClient().whatif(args.base, args.changes, args.baseCalculationId),
  })
}

export function useSaveAnswers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (answers: AnswerInput[]) => getClient().saveAnswers(answers),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.answers }),
  })
}
