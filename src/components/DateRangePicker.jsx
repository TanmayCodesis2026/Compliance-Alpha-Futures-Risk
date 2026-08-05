import { useEffect, useMemo, useRef, useState } from 'react'

// Range picker with a preset rail (last 1/3/6 months, last year, all time) and a
// two-month calendar. Values cross the boundary as 'YYYY-MM-DD' strings — the
// same shape the native <input type="date"> it replaced produced — so callers
// keep filtering on plain ISO days in the browser's timezone.

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

// Clamps the day so 31 Mar minus one month lands on 28/29 Feb rather than
// rolling forward into March, which is what Date arithmetic would do.
const addMonths = (d, n) => {
  const y = d.getFullYear()
  const m = d.getMonth() + n
  const target = new Date(y, m, 1)
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth())))
}

const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// months: how far back from today the range starts. null = clear both bounds.
const PRESETS = [
  { value: '1m', label: 'Last 1 month', months: 1 },
  { value: '3m', label: 'Last 3 months', months: 3 },
  { value: '6m', label: 'Last 6 months', months: 6 },
  { value: '1y', label: 'Last 1 year', months: 12 },
  { value: 'all', label: 'All time', months: null },
]

// Both bounds inclusive: today back to the same day-of-month N months ago.
const presetRange = (months, today) =>
  months === null ? { from: '', to: '' } : { from: toISO(addMonths(today, -months)), to: toISO(today) }

// Six full weeks starting on the Sunday on or before the 1st, so every month
// renders the same height and the leading/trailing days stay visible.
const monthCells = (year, month) => {
  const lead = new Date(year, month, 1).getDay()
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - lead + i))
}

const fmt = (d, withYear = true) => `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`

const navBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, flex: 'none', padding: 0,
  border: 0, borderRadius: 6, background: 'transparent',
  color: 'var(--text-3)', font: 'inherit', fontSize: 13, lineHeight: 1, cursor: 'pointer',
}

const monthTitle = { flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }

const weekdayCell = { height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }

function Month({ year, month, from, to, hover, pendingStart, onPick, onHover, today, header }) {
  const cells = useMemo(() => monthCells(year, month), [year, month])

  // While one endpoint is pending the hovered day stands in for the other, so
  // the band previews the range the next click would commit.
  const a = pendingStart || from
  const b = pendingStart ? hover : to
  const lo = a && b ? (a <= b ? a : b) : a
  const hi = a && b ? (a <= b ? b : a) : null

  return (
    <div style={{ flex: 'none' }}>
      {header}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: 2 }}>
        {WEEKDAYS.map((w) => <div key={w} style={weekdayCell}>{w}</div>)}
        {cells.map((day) => {
          const outside = day.getMonth() !== month
          const isLo = sameDay(day, lo)
          const isHi = sameDay(day, hi)
          const inRange = hi && day > lo && day < hi
          const isEnd = isLo || isHi

          return (
            <button
              key={day.getTime()}
              type="button"
              onClick={() => onPick(day)}
              onMouseEnter={() => onHover(day)}
              aria-label={`${day.getDate()} ${MONTHS_LONG[day.getMonth()]} ${day.getFullYear()}`}
              aria-pressed={isEnd || inRange}
              style={{
                height: 30, padding: 0, borderRadius: 7, cursor: 'pointer',
                font: 'inherit', fontSize: 12,
                border: sameDay(day, today) && !isEnd ? '1px solid var(--border-strong)' : '1px solid transparent',
                background: isEnd ? 'var(--accent)' : inRange ? 'var(--accent-soft)' : 'transparent',
                color: isEnd ? 'var(--accent-fg)' : outside ? 'var(--text-3)' : 'var(--text)',
                fontWeight: isEnd ? 600 : 400,
                opacity: outside && !isEnd && !inRange ? 0.55 : 1,
                transition: 'background .12s ease, color .12s ease',
              }}
              className={isEnd ? undefined : 'cal-cell-hover'}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DateRangePicker({ from, to, onChange, height = 38 }) {
  const [open, setOpen] = useState(false)
  const [pendingStart, setPendingStart] = useState(null) // first click of a new range
  const [hover, setHover] = useState(null)
  const [view, setView] = useState(null) // left-hand month; null until first open
  const wrapRef = useRef(null)

  const today = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }, [])
  const fromDate = useMemo(() => parseISO(from), [from])
  const toDate = useMemo(() => parseISO(to), [to])

  // Today's month belongs on the right, so an untouched picker opens on
  // [last month | this month] — the window presets mostly land in.
  const leftMonth = view || startOfMonth(fromDate || addMonths(today, -1))
  const rightMonth = addMonths(leftMonth, 1)

  const activePreset = useMemo(() => {
    const hit = PRESETS.find((p) => {
      const r = presetRange(p.months, today)
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

  const openPicker = () => {
    setView(startOfMonth(fromDate || addMonths(today, -1)))
    setPendingStart(null)
    setHover(null)
    setOpen(true)
  }

  const applyPreset = (preset) => {
    const r = presetRange(preset.months, today)
    onChange(r.from, r.to)
    setPendingStart(null)
    setHover(null)
    setOpen(false)
  }

  // First click arms the range, second commits it — clicking either way round
  // works because the pair is sorted before it leaves the component.
  const pickDay = (day) => {
    if (!pendingStart) {
      setPendingStart(day)
      setHover(day)
      return
    }
    const [lo, hi] = pendingStart <= day ? [pendingStart, day] : [day, pendingStart]
    onChange(toISO(lo), toISO(hi))
    setPendingStart(null)
    setHover(null)
    setOpen(false)
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange('', '')
    setPendingStart(null)
    setHover(null)
  }

  const label = useMemo(() => {
    if (activePreset && activePreset !== 'all') return PRESETS.find((p) => p.value === activePreset).label
    if (fromDate && toDate) {
      const sameYear = fromDate.getFullYear() === toDate.getFullYear()
      return `${fmt(fromDate, !sameYear)} → ${fmt(toDate)}`
    }
    if (fromDate) return `From ${fmt(fromDate)}`
    if (toDate) return `Until ${fmt(toDate)}`
    return 'All time'
  }, [activePreset, fromDate, toDate])

  const hasRange = Boolean(from || to)

  const stepView = (n) => setView(startOfMonth(addMonths(leftMonth, n)))

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Detection date range"
        style={{
          display: 'flex', alignItems: 'center', height,
          background: 'var(--inset)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          boxShadow: open ? '0 0 0 3px var(--accent-soft)' : 'none',
          borderRadius: 10, overflow: 'hidden', padding: 0,
          font: 'inherit', color: 'var(--text)', cursor: 'pointer',
          transition: 'border-color .15s ease, box-shadow .15s ease',
        }}
      >
        <span style={{ padding: '0 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', whiteSpace: 'nowrap', flex: 'none' }}>Date</span>
        <span style={{ width: 1, alignSelf: 'stretch', margin: '7px 0', background: 'var(--border)', flex: 'none' }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px' }}>
          <span style={{ fontSize: 12.5, color: hasRange ? 'var(--text)' : 'var(--text-2)', whiteSpace: 'nowrap' }}>{label}</span>
          {hasRange
            ? (
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
            )
            : <span style={{ color: 'var(--text-3)', fontSize: 10, flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>▾</span>}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select detection date range"
          onMouseLeave={() => setHover(pendingStart)}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 60,
            display: 'flex', alignItems: 'stretch',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
            maxWidth: 'calc(100vw - 52px)',
          }}
        >
          {/* preset rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8, borderRight: '1px solid var(--border)', background: 'var(--surface-2)', flex: 'none' }}>
            {PRESETS.map((preset) => {
              const active = activePreset === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={active}
                  className={active ? undefined : 'ghost-btn'}
                  style={{
                    textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 0,
                    background: active ? 'var(--inset)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--text-2)',
                    font: 'inherit', fontSize: 12.5, fontWeight: active ? 600 : 500,
                    whiteSpace: 'nowrap', cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* two-month calendar */}
          <div style={{ display: 'flex', gap: 20, padding: 12, overflowX: 'auto' }}>
            <Month
              year={leftMonth.getFullYear()}
              month={leftMonth.getMonth()}
              from={fromDate} to={toDate} hover={hover} pendingStart={pendingStart} today={today}
              onPick={pickDay} onHover={setHover}
              header={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6 }}>
                  <button type="button" onClick={() => stepView(-12)} aria-label="Previous year" className="ghost-btn" style={navBtn}>«</button>
                  <button type="button" onClick={() => stepView(-1)} aria-label="Previous month" className="ghost-btn" style={navBtn}>‹</button>
                  <span style={monthTitle}>{MONTHS[leftMonth.getMonth()]} {leftMonth.getFullYear()}</span>
                  <span style={{ width: 52, flex: 'none' }} />
                </div>
              )}
            />
            <Month
              year={rightMonth.getFullYear()}
              month={rightMonth.getMonth()}
              from={fromDate} to={toDate} hover={hover} pendingStart={pendingStart} today={today}
              onPick={pickDay} onHover={setHover}
              header={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6 }}>
                  <span style={{ width: 52, flex: 'none' }} />
                  <span style={monthTitle}>{MONTHS[rightMonth.getMonth()]} {rightMonth.getFullYear()}</span>
                  <button type="button" onClick={() => stepView(1)} aria-label="Next month" className="ghost-btn" style={navBtn}>›</button>
                  <button type="button" onClick={() => stepView(12)} aria-label="Next year" className="ghost-btn" style={navBtn}>»</button>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default DateRangePicker
