import { useEffect, useMemo, useRef, useState } from 'react'

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseISO = (s) => {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// Clamps the day so 31 Mar minus one month lands on 28/29 Feb rather than
// rolling forward into March, which is what raw Date arithmetic would do.
const addMonths = (d, n) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth())))
}

const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Every preset is a window ending today; `days`/`months` is how far back it starts.
const PRESETS = [
  { value: '1d', label: 'Last 1 day', days: 1 },
  { value: '3d', label: 'Last 3 days', days: 3 },
  { value: '1w', label: 'Last 1 week', days: 7 },
  { value: '1m', label: 'Last 1 month', months: 1 },
  { value: '3m', label: 'Last 3 months', months: 3 },
  { value: '6m', label: 'Last 6 months', months: 6 },
  { value: '1y', label: 'Last 1 year', months: 12 },
  { value: 'all', label: 'All time' },
]

const presetRange = (preset, today) => {
  if (preset.days) return { from: toISO(addDays(today, -preset.days)), to: toISO(today) }
  if (preset.months) return { from: toISO(addMonths(today, -preset.months)), to: toISO(today) }
  return { from: '', to: '' } // All time clears both bounds
}

// Six full weeks starting on the Sunday on or before the 1st, so every month is
// the same height and the leading/trailing days stay visible.
const monthCells = (year, month) => {
  const lead = new Date(year, month, 1).getDay()
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - lead + i))
}

// 'Jul 05, 2026' — the format the trigger fields show.
const fmtLong = (d) => `${MONTHS[d.getMonth()]} ${pad(d.getDate())}, ${d.getFullYear()}`

const CELL = 36        // column width; the band is continuous, so cells don't gap
const ROW = 34
const BAND_RADIUS = 9

const navBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, flex: 'none', padding: 0,
  border: 0, borderRadius: 7, background: 'transparent',
  color: 'var(--text-2)', font: 'inherit', fontSize: 14, lineHeight: 1, cursor: 'pointer',
}

const monthTitle = { flex: 1, textAlign: 'center', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', letterSpacing: '0.01em' }

const weekdayCell = { height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 500, color: 'var(--text-3)' }

// One month grid. The selected span is painted on a wrapper behind each day so
// it reads as one continuous band: rounded only where the run actually breaks —
// at the endpoints, at the week edges, and where an adjacent-month day cuts it.
function Month({ year, month, lo, hi, today, onPick, onHover }) {
  const cells = useMemo(() => monthCells(year, month), [year, month])

  const banded = cells.map((day) => {
    if (day.getMonth() !== month) return false // adjacent-month days sit outside the band
    if (lo && hi) return day >= lo && day <= hi
    return sameDay(day, lo) || sameDay(day, hi)
  })

  return (
    <div style={{ flex: 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL}px)` }}>
        {WEEKDAYS.map((w) => <div key={w} style={weekdayCell}>{w}</div>)}

        {cells.map((day, i) => {
          const outside = day.getMonth() !== month
          const isLo = sameDay(day, lo)
          const isHi = sameDay(day, hi)
          const isEnd = isLo || isHi
          const inBand = banded[i]
          // The band breaks at a week edge or wherever the neighbouring cell isn't banded.
          const capL = i % 7 === 0 || !banded[i - 1]
          const capR = i % 7 === 6 || !banded[i + 1]

          return (
            <div
              key={day.getTime()}
              style={{
                height: ROW,
                background: inBand && !isEnd ? 'var(--range-band)' : 'transparent',
                borderRadius: `${capL ? BAND_RADIUS : 0}px ${capR ? BAND_RADIUS : 0}px ${capR ? BAND_RADIUS : 0}px ${capL ? BAND_RADIUS : 0}px`,
                // An endpoint keeps the band flowing on its inner side.
                backgroundImage: isEnd && inBand && ((isLo && !capR) || (isHi && !capL))
                  ? `linear-gradient(${isLo ? '90deg' : '270deg'}, transparent 50%, var(--range-band) 50%)`
                  : undefined,
              }}
            >
              <button
                type="button"
                onClick={() => onPick(day)}
                onMouseEnter={() => onHover(day)}
                aria-label={`${day.getDate()} ${MONTHS_LONG[day.getMonth()]} ${day.getFullYear()}`}
                aria-pressed={isEnd}
                // In-band days keep the band on hover — a tint would break the run.
                className={isEnd || inBand ? undefined : 'cal-cell-hover'}
                style={{
                  width: '100%', height: '100%', padding: 0, borderRadius: BAND_RADIUS,
                  font: 'inherit', fontSize: 12.5, cursor: 'pointer',
                  border: sameDay(day, today) && !isEnd ? '1px solid var(--border-strong)' : '1px solid transparent',
                  background: isEnd ? 'var(--info)' : 'transparent',
                  color: isEnd ? 'var(--accent-fg)' : outside ? 'var(--text-3)' : 'var(--text)',
                  fontWeight: isEnd ? 600 : 400,
                  opacity: outside && !isEnd ? 0.5 : 1,
                  transition: 'background .12s ease, color .12s ease',
                }}
              >
                {day.getDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// One endpoint of the trigger. Reads as a text field: the active one is
// underlined, so it's clear which end the next calendar click will set.
const Field = ({ value, placeholder, active, onClick, ariaLabel }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    style={{
      padding: '2px 0', border: 0, borderBottom: `2px solid ${active ? 'var(--info)' : 'transparent'}`,
      background: 'transparent', font: 'inherit', fontSize: 12.5,
      color: value ? 'var(--text)' : 'var(--text-3)',
      cursor: 'pointer', whiteSpace: 'nowrap',
      fontFamily: value ? "'Geist Mono',monospace" : 'inherit',
      transition: 'border-color .15s ease',
    }}
  >
    {value || placeholder}
  </button>
)

function DateRangePicker({ from, to, onChange, height = 38 }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('from') // which endpoint the next click sets
  const [draft, setDraft] = useState(null)     // half-picked range; null = mirror props
  const [hover, setHover] = useState(null)
  const [view, setView] = useState(null)       // left-hand month
  const wrapRef = useRef(null)

  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }, [])

  // The draft wins while the popover is open so the fields track what's being
  // picked; closing without a second click discards it.
  const shown = draft || { from, to }
  const shownFrom = useMemo(() => parseISO(shown.from), [shown.from])
  const shownTo = useMemo(() => parseISO(shown.to), [shown.to])

  // While one end is still open the hovered day stands in for it, so the band
  // previews the range the next click would commit.
  const previewFrom = active === 'from' && hover && !shown.from ? hover : shownFrom
  const previewTo = active === 'to' && hover && !shown.to ? hover : shownTo
  const [lo, hi] = previewFrom && previewTo && previewFrom > previewTo
    ? [previewTo, previewFrom]
    : [previewFrom, previewTo]

  // Today's month belongs on the right, so an untouched picker opens on
  // [last month | this month] — the window the presets mostly land in.
  const leftMonth = view || startOfMonth(shownFrom || addMonths(today, -1))
  const rightMonth = addMonths(leftMonth, 1)

  const activePreset = useMemo(() => {
    const hit = PRESETS.find((p) => {
      const r = presetRange(p, today)
      return r.from === (from || '') && r.to === (to || '')
    })
    return hit ? hit.value : null
  }, [from, to, today])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openOn = (endpoint) => {
    setView(startOfMonth(parseISO(endpoint === 'to' ? to : from) || addMonths(today, -1)))
    setDraft(null)
    setHover(null)
    setActive(endpoint)
    setOpen(true)
  }

  const commit = (nextFrom, nextTo) => {
    setDraft(null)
    setHover(null)
    setOpen(false)
    onChange(nextFrom, nextTo)
  }

  const applyPreset = (preset) => {
    const r = presetRange(preset, today)
    setActive('from')
    commit(r.from, r.to)
  }

  // Sets whichever endpoint is active. A range that's complete commits and
  // closes; a half-picked one stays open with focus moved to the other end.
  const pickDay = (day) => {
    const iso = toISO(day)

    if (active === 'from') {
      // An existing end before the new start no longer bounds anything.
      const keepTo = shown.to && iso <= shown.to ? shown.to : ''
      if (keepTo) return commit(iso, keepTo)
      setDraft({ from: iso, to: '' })
      setHover(null)
      setActive('to')
      return
    }

    // Picking an end before the start reads as restarting the range.
    if (shown.from && iso < shown.from) {
      setDraft({ from: iso, to: '' })
      setHover(null)
      setActive('to')
      return
    }
    if (!shown.from) {
      setDraft({ from: '', to: iso })
      setHover(null)
      setActive('from')
      return
    }
    commit(shown.from, iso)
  }

  const clear = (e) => {
    e.stopPropagation()
    setActive('from')
    commit('', '')
  }

  const stepView = (n) => setView(startOfMonth(addMonths(leftMonth, n)))

  const hasRange = Boolean(from || to)

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 'none' }}>
      {/* trigger: label cap, then both endpoints as their own fields */}
      <div
        style={{
          display: 'flex', alignItems: 'center', height,
          background: 'var(--inset)',
          border: `1px solid ${open ? 'var(--info)' : 'var(--border)'}`,
          boxShadow: open ? '0 0 0 3px var(--range-band)' : 'none',
          borderRadius: 10, overflow: 'hidden',
          transition: 'border-color .15s ease, box-shadow .15s ease',
        }}
      >
        <span style={{ padding: '0 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', whiteSpace: 'nowrap', flex: 'none' }}>Date</span>
        <span style={{ width: 1, alignSelf: 'stretch', margin: '7px 0', background: 'var(--border)', flex: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 10px' }}>
          <Field
            value={shownFrom ? fmtLong(shownFrom) : ''}
            placeholder="Start date"
            active={open && active === 'from'}
            onClick={() => (open && active !== 'from' ? setActive('from') : open ? setOpen(false) : openOn('from'))}
            ariaLabel="Range start date"
          />
          <span style={{ color: 'var(--text-3)', fontSize: 12, flex: 'none' }}>→</span>
          <Field
            value={shownTo ? fmtLong(shownTo) : ''}
            placeholder="End date"
            active={open && active === 'to'}
            onClick={() => (open && active !== 'to' ? setActive('to') : open ? setOpen(false) : openOn('to'))}
            ariaLabel="Range end date"
          />
          {hasRange && (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') clear(e) }}
              aria-label="Clear date range"
              style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, background: 'var(--border)', color: 'var(--text-2)', fontSize: 12, lineHeight: 1, cursor: 'pointer' }}
            >
              ×
            </span>
          )}
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Select detection date range"
          onMouseLeave={() => setHover(null)}
          style={{
            position: 'absolute', top: 'calc(100% + 9px)', left: 0, zIndex: 60,
            display: 'flex', alignItems: 'stretch',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-lg)',
            maxWidth: 'calc(100vw - 52px)',
          }}
        >
          {/* caret tying the popover to the trigger above it */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -5, left: 26, width: 9, height: 9,
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
              transform: 'rotate(45deg)', borderRadius: 1,
            }}
          />

          {/* preset rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8, borderRight: '1px solid var(--border)', background: 'var(--surface-2)', borderRadius: '12px 0 0 12px', flex: 'none' }}>
            {PRESETS.map((preset) => {
              const isActive = activePreset === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={isActive}
                  className={isActive ? undefined : 'ghost-btn'}
                  style={{
                    textAlign: 'left', padding: '7px 12px', borderRadius: 7, border: 0,
                    background: isActive ? 'var(--range-band)' : 'transparent',
                    // --text, not --info: blue-on-band clears AA in light but only
                    // reaches ~4.2:1 in dark, and this label isn't large text.
                    color: isActive ? 'var(--text)' : 'var(--text-2)',
                    font: 'inherit', fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                    whiteSpace: 'nowrap', cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* two-month calendar */}
          <div style={{ padding: '12px 14px 14px', overflowX: 'auto' }}>
            {/* Each header is exactly one grid wide, with a spacer balancing the
                arrows so the month name centres over its own weeks. */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 4 }}>
              <div style={{ width: CELL * 7, display: 'flex', alignItems: 'center', gap: 2 }}>
                <button type="button" onClick={() => stepView(-12)} aria-label="Previous year" className="ghost-btn" style={navBtn}>«</button>
                <button type="button" onClick={() => stepView(-1)} aria-label="Previous month" className="ghost-btn" style={navBtn}>‹</button>
                <span style={monthTitle}>{MONTHS[leftMonth.getMonth()]} {leftMonth.getFullYear()}</span>
                <span style={{ width: 54, flex: 'none' }} />
              </div>
              <div style={{ width: CELL * 7, display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ width: 54, flex: 'none' }} />
                <span style={monthTitle}>{MONTHS[rightMonth.getMonth()]} {rightMonth.getFullYear()}</span>
                <button type="button" onClick={() => stepView(1)} aria-label="Next month" className="ghost-btn" style={navBtn}>›</button>
                <button type="button" onClick={() => stepView(12)} aria-label="Next year" className="ghost-btn" style={navBtn}>»</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24 }}>
              <Month
                year={leftMonth.getFullYear()} month={leftMonth.getMonth()}
                lo={lo} hi={hi} today={today} onPick={pickDay} onHover={setHover}
              />
              <Month
                year={rightMonth.getFullYear()} month={rightMonth.getMonth()}
                lo={lo} hi={hi} today={today} onPick={pickDay} onHover={setHover}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DateRangePicker
