// Loading affordances, in the two shapes the app needs.
//
// Skeleton — content that isn't on screen yet (first load). It mirrors the real
// layout so nothing jumps when the data lands.
// Spinner / LoadingBar — content that IS on screen while it refreshes (a filter
// or search refetch). Never blank out rows the user is already reading.
//
// The animations live in index.css so a single prefers-reduced-motion rule can
// tone all of them down at once.

// Themed ring spinner. Inherits nothing — pass `color` to tint it.
export const Spinner = ({ size = 14, stroke = 2, color = 'var(--text-2)', label }) => (
  <span
    className="spinner"
    role={label ? 'status' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    style={{
      display: 'inline-block', flex: 'none',
      width: size, height: size, borderWidth: stroke,
      borderColor: 'var(--border)', borderTopColor: color,
    }}
  />
)

// One shimmering placeholder bar.
export const SkeletonBar = ({ width = '100%', height = 12, radius = 5, delay = 0 }) => (
  <span
    className="skeleton"
    style={{ display: 'block', width, height, borderRadius: radius, animationDelay: delay ? `${delay}s` : undefined }}
  />
)

// Indeterminate 2px rail — sits on the top edge of a card that is refreshing.
export const LoadingBar = ({ height = 2 }) => (
  <div className="rail-track" style={{ height, flex: 'none' }} aria-hidden="true" />
)

// Spinner + text, for a toolbar or a card header.
export const InlineLoading = ({ children = 'Updating…', size = 12 }) => (
  <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-3)', fontSize: 12, whiteSpace: 'nowrap' }}>
    <Spinner size={size} stroke={1.5} />
    {children}
  </span>
)
