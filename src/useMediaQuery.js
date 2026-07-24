import { useState, useEffect } from 'react'

// Subscribe to a CSS media query and re-render on change.
// Used to drive structural responsive changes that inline styles can't express.
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(query).matches
    : false)
  const [matches, setMatches] = useState(get)

  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Shared breakpoints (px).
export const BP = { mobile: 768, narrow: 1100 }
export const useIsMobile = () => useMediaQuery(`(max-width: ${BP.mobile}px)`)
export const useIsNarrow = () => useMediaQuery(`(max-width: ${BP.narrow}px)`)
