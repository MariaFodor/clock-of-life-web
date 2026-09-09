// The article behind a factor, as a link the reader can actually open.
//
// The product promises evidence traceability. A prose string ("Trichopoulou 2003; PREDIMED") looks
// like it keeps that promise and does not: nobody can check it without a search. Every citation the
// UI shows now carries a DOI that was verified when the ontology was written.

export function ArticleLink({
  url,
  doi,
  firstAuthor,
  year,
  citation,
}: {
  url?: string
  doi?: string
  firstAuthor?: string
  year?: number
  citation?: string
}) {
  // Only http(s). React warns on a `javascript:` href but does not block it, and this value comes
  // from a model artifact rather than from us — so it is validated here, not trusted.
  const safeUrl = (() => {
    if (!url) return undefined
    try {
      const u = new URL(url)
      return u.protocol === 'https:' || u.protocol === 'http:' ? url : undefined
    } catch {
      return undefined
    }
  })()
  const href = safeUrl ?? (doi ? `https://doi.org/${encodeURIComponent(doi)}` : undefined)
  const label = firstAuthor && year ? `${firstAuthor} ${year}` : (citation ?? 'source')

  if (!href) {
    // Deliberately explicit: an unlinked citation is shown as unlinked, never dressed up as one.
    return <span className="text-xs text-clock-muted">{citation ?? 'no source recorded'}</span>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={citation}
      className="text-xs text-clock-brand underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {label} ↗
    </a>
  )
}
