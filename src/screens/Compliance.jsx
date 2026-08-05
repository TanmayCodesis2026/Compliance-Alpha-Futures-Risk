import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { authJson, SessionExpiredError } from '../auth.js'
import DateRangePicker from '../components/DateRangePicker.jsx'
import { InlineLoading, LoadingBar, SkeletonBar, Spinner } from '../components/Loaders.jsx'
const baseURL = import.meta.env.VITE_BASE_URL;

const API_URL = `${baseURL}admin/compliance/duplicates/all/`

// matched_fields[].field arrives lowercase — these are NOT the *_FLAG keys on
// the parent entry's `flags` object.
const FIELD_LABELS = {
  surname: 'Surname',
  address: 'Address',
  postcode: 'Postcode',
  ip: 'IP',
  cid: 'CID',
  mt5_cid: 'MT5 CID',
  crypto: 'Crypto',
  payment: 'Payment',
}

const PAGE_SIZES = [10, 25, 50, 100]

// Header labels and the loading skeleton share one definition, so a column can't
// be added or reordered without the skeleton following it.
const COLUMNS = [
  { key: 'account', label: 'Account', bars: [{ w: '58%', h: 12 }, { w: '76%', h: 9 }] },
  { key: 'counterparty', label: 'Matched With', bars: [{ w: '54%', h: 12 }, { w: '72%', h: 9 }] },
  { key: 'count', label: 'Match Count', align: 'right', bars: [{ w: 26, h: 12 }] },
  { key: 'fields', label: 'Matched Fields', inline: true, bars: [{ w: 58, h: 20, r: 999 }, { w: 44, h: 20, r: 999 }] },
  { key: 'details', label: 'Details', bars: [{ w: 66, h: 12 }] },
]

// Enough rows to fill the fold without pretending to know the result count.
const SKELETON_ROWS = 8

// Each value is the flag name the backend expects in `fields`; 'all' sends none.
const EVIDENCE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'surname', label: 'Surname' },
  { value: 'address', label: 'Address' },
  { value: 'ip', label: 'IP' },
  { value: 'cid', label: 'CID' },
]

const EMPTY_FILTERS = { search: '', evidence: 'all', from: '', to: '' }

// Typing shouldn't fire a request per keystroke; tabs and dates apply at once.
const SEARCH_DEBOUNCE_MS = 350

// Filtering and paging both happen server-side — this is the only place toolbar
// and pager state becomes a request:
//   fields=cid                       one evidence flag
//   date=2026-08-05                  a single day
//   date_from=…&date_to=…            a range
//   search=nrehman_88%40hotmail.com  account name, email or ID
//   page=1&page_size=10              always sent, alongside whatever filters apply
const buildQuery = ({ search, evidence, from, to }, page, pageSize) => {
  const params = new URLSearchParams()
  const term = search.trim()

  if (term) params.set('search', term)
  if (evidence !== 'all') params.set('fields', evidence)
  // A range collapsed onto one day is the exact-date case the API models separately.
  if (from && from === to) params.set('date', from)
  else {
    if (from) params.set('date_from', from)
    if (to) params.set('date_to', to)
  }

  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  return `?${params.toString()}`
}

// The payload is either a bare array or wrapped — same shapes Compliance.jsx handles.
const normalizeUsers = (payload) => {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.results)) return payload.results
  if (payload && Array.isArray(payload.users)) return payload.users
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

// Unpaginated total, under whichever name the envelope uses. Null means the
// backend didn't send one, which is the difference between knowing the last page
// number and only knowing whether another page exists.
const TOTAL_KEYS = ['count', 'total', 'total_count', 'num_results']
const pickTotal = (payload) => {
  if (!payload || Array.isArray(payload)) return null
  for (const key of TOTAL_KEYS) {
    const value = Number(payload[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

// A `next` link is the other way a paginated envelope says "there's more".
const hasNextLink = (payload) => Boolean(payload && !Array.isArray(payload) && (payload.next || payload.next_page))

// One row per flagged pair. The API nests `matches` under each user, so a user
// with 3 counterparties becomes 3 rows — otherwise "match count" has no subject.
const flattenPairs = (users) =>
  users.flatMap((entry) =>
    (entry.matches || []).map((match) => ({
      subject: entry.user || null,
      totalFlags: entry.total_flags || 0,
      counterparty: match.user || null,
      matchCount: match.match_count || 0,
      matchedFields: match.matched_fields || [],
    }))
  )

const Chip = ({ children }) => (
  <span style={{ padding: '3px 9px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
    {children}
  </span>
)

// ---- toolbar primitives -------------------------------------------------
// Every control is the same 38px inset pill so the filter strip reads as one
// row: a muted label cap, a hairline divider, then the field itself.
const CONTROL_HEIGHT = 38

const pillShell = (focused) => ({
  display: 'flex', alignItems: 'center', height: CONTROL_HEIGHT,
  background: 'var(--inset)',
  border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
  boxShadow: focused ? '0 0 0 3px var(--accent-soft)' : 'none',
  borderRadius: 10, overflow: 'hidden',
  transition: 'border-color .15s ease, box-shadow .15s ease',
})

const bareInput = {
  border: 'none', background: 'transparent', outline: 'none', font: 'inherit',
  fontSize: 13, color: 'var(--text)', width: '100%', minWidth: 0, padding: 0,
}

const ClearBtn = ({ onClick, label }) => (
  <button
    onClick={onClick}
    aria-label={label}
    style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, border: 0, borderRadius: 999, background: 'var(--border)', color: 'var(--text-2)', font: 'inherit', fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0 }}
  >
    ×
  </button>
)

// Segmented evidence filter: a caption followed by mutually exclusive tabs, the
// selected one lifted onto --surface so it reads as raised out of the track.
const Segmented = ({ caption, options, value, onChange, ariaLabel }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
    <span style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{caption}</span>
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex', alignItems: 'center', gap: 3, height: CONTROL_HEIGHT,
        padding: 3, borderRadius: 10, background: 'var(--inset)', border: '1px solid var(--border)',
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={active ? undefined : 'ghost-btn'}
            style={{
              height: '100%', padding: '0 12px', borderRadius: 7, border: 0,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-2)',
              boxShadow: active ? 'var(--shadow)' : 'none',
              font: 'inherit', fontSize: 12.5, fontWeight: active ? 600 : 500,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'background .15s ease, color .15s ease',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  </div>
)

const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td = { padding: '12px', borderBottom: '1px solid var(--hair)', color: 'var(--text)', verticalAlign: 'top' }

// Evidence lays out horizontally in the expanded row: one labelled column per
// matched field, shared values inline beneath the label.
const evidenceLabel = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)' }
const valueChip = { padding: '2px 8px', borderRadius: 6, background: 'var(--inset)', color: 'var(--text-2)', fontFamily: "'Geist Mono',monospace", fontSize: 11.5, whiteSpace: 'nowrap' }

const pagerShell = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }

const pagerBtn = (disabled) => ({
  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface)', color: disabled ? 'var(--text-3)' : 'var(--text-2)',
  cursor: disabled ? 'default' : 'pointer', font: 'inherit', fontSize: 12,
})

const SkeletonRows = ({ count }) =>
  Array.from({ length: count }, (_, row) => (
    <tr key={row}>
      {COLUMNS.map((col) => (
        <td key={col.key} style={td}>
          <div
            style={{
              display: 'flex',
              flexDirection: col.inline ? 'row' : 'column',
              gap: col.inline ? 6 : 7,
              alignItems: col.inline ? 'center' : col.align === 'right' ? 'flex-end' : 'stretch',
              justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
            }}
          >
            {col.bars.map((bar, i) => (
              <SkeletonBar key={i} width={bar.w} height={bar.h} radius={bar.r} delay={(row % 5) * 0.09} />
            ))}
          </div>
        </td>
      ))}
    </tr>
  ))

function Compliance() {
  // `query` records which request the held rows came from, so "is a request in
  // flight" is derived from the filters rather than tracked as its own flag.
  const [result, setResult] = useState({ query: null, data: null, error: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [expanded, setExpanded] = useState({}) // rowKey -> open
  const [filters, setFilters] = useState(EMPTY_FILTERS) // what the request carries
  const [searchInput, setSearchInput] = useState('')    // raw text box, debounced into filters
  const [focus, setFocus] = useState(null) // which toolbar field owns the focus ring

  const toggleRow = (rowKey) => setExpanded((s) => ({ ...s, [rowKey]: !s[rowKey] }))

  const queryString = useMemo(() => buildQuery(filters, page, pageSize), [filters, page, pageSize])
  const isFetching = result.query !== queryString
  const isFirstLoad = isFetching && result.data === null
  const errorMessage = isFetching ? '' : result.error
  const applyOnly = useCallback((next) => {
    setFilters({ ...EMPTY_FILTERS, ...next })
    setPage(1)
    setExpanded({})
  }, [])

  useEffect(() => {
    if (searchInput === filters.search) return
    const timer = setTimeout(() => applyOnly({ search: searchInput }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, filters.search, applyOnly])

  useEffect(() => {
    const controller = new AbortController()

    authJson(`${API_URL}${queryString}`, { signal: controller.signal })
      .then((data) => setResult({ query: queryString, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResult((prev) => ({
          query: queryString,
          data: prev.data,
          error: err instanceof SessionExpiredError
            ? err.message
            : err?.message || 'Unable to load compliance matches from the API.',
        }))
      })

    return () => controller.abort()
  }, [queryString])

  const users = useMemo(() => normalizeUsers(result.data), [result.data])
  const allRows = useMemo(() => flattenPairs(users), [users])

  const hasFilters = Boolean(searchInput || filters.evidence !== 'all' || filters.from || filters.to)
  // The search box gets its own spinner: it's the one control whose effect is
  // delayed (debounce), so without it a keystroke looks like it did nothing.
  const isSearching = searchInput !== filters.search || (isFetching && Boolean(filters.search))

  // ---- pagination ----------------------------------------------------------
  // `page` and `page_size` ride on every request, but a response can still carry
  // more rows than a page holds — the endpoint is /all/, and one entry flattens
  // into a row per counterparty — so the page is cut here too. Whatever the
  // filters match, the table shows `pageSize` rows and no more.
  //
  // Which side owns the page numbers depends on what came back:
  //   `count` in the envelope  -> the server paged; the slice is just a cap
  //   only a `next` link       -> the server paged, last page unknown
  //   neither                  -> unpaginated; the client cuts every page
  const total = pickTotal(result.data)
  const serverPaged = total !== null || hasNextLink(result.data)
  const pageCount = total !== null
    ? Math.max(1, Math.ceil(total / pageSize))
    : serverPaged ? null : Math.max(1, Math.ceil(allRows.length / pageSize))

  const safePage = pageCount === null ? page : Math.min(page, pageCount)
  const start = serverPaged ? 0 : (safePage - 1) * pageSize
  const rows = allRows.slice(start, start + pageSize)

  const canPrev = safePage > 1
  const canNext = pageCount === null ? hasNextLink(result.data) : safePage < pageCount

  // Paging swaps the whole body, and row keys are positional, so expansions go.
  const goPage = (n) => {
    const next = pageCount === null ? Math.max(1, n) : Math.min(Math.max(1, n), pageCount)
    if (next === safePage) return
    setPage(next)
    setExpanded({})
  }
  const changePageSize = (n) => { setPageSize(n); setPage(1); setExpanded({}) }
  // Both bounds move together — the picker never emits a half-applied range.
  const setDateRange = (from, to) => { setSearchInput(''); applyOnly({ from, to }) }
  const setEvidence = (evidence) => { setSearchInput(''); applyOnly({ evidence }) }
  const clearFilters = () => { setSearchInput(''); applyOnly({}) }

  return (
    <section style={{ padding: 26, flex: 1 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Compliance</h1>
        <div style={{ marginTop: 6, color: 'var(--text-2)' }}>
          Duplicate-account matches across surname, address, IP, CID, wallet and card.
        </div>
      </div>
      {/* toolbar: search + evidence filters + detection date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div
          style={{
            ...pillShell(focus === 'query'),
            gap: 9, padding: '0 12px',
            flex: '1 1 260px', maxWidth: 380,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" style={{ flex: 'none' }}><circle cx="6.3" cy="6.3" r="4.6" stroke="var(--text-3)" strokeWidth="1.5" /><line x1="9.7" y1="9.7" x2="13.5" y2="13.5" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => setFocus('query')}
            onBlur={() => setFocus(null)}
            placeholder="Search account — name, email or ID…"
            aria-label="Search accounts by name, email or ID"
            style={bareInput}
          />
          {isSearching
            ? <Spinner size={14} label="Searching" />
            : searchInput && <ClearBtn onClick={() => setSearchInput('')} label="Clear search" />}
        </div>

        <Segmented
          caption="Matched on"
          ariaLabel="Filter by matched field"
          options={EVIDENCE_OPTIONS}
          value={filters.evidence}
          onChange={setEvidence}
        />

        {/* One pill for the whole range: relative presets (last 1/3/6 months,
            last year) plus a two-month calendar for an explicit window. */}
        <DateRangePicker
          from={filters.from}
          to={filters.to}
          onChange={setDateRange}
          height={CONTROL_HEIGHT}
        />

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="ghost-btn"
            style={{ height: CONTROL_HEIGHT, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', font: 'inherit', fontSize: 12.5, cursor: 'pointer', flex: 'none' }}
          >
            Clear all
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', minHeight: 18, color: 'var(--text-3)', fontSize: 12 }}>
          {isFetching
            ? <InlineLoading>{isFirstLoad ? 'Loading matches…' : 'Updating results…'}</InlineLoading>
            : hasFilters
              ? total === null
                ? `${rows.length} on this page`
                : `${total} result${total === 1 ? '' : 's'}`
              : ''}
        </div>
      </div>

      {errorMessage ? (
        <div style={{ border: '1px solid var(--crit)', background: 'var(--crit-soft)', borderRadius: 12, padding: 22, color: 'var(--crit)' }}>
          {errorMessage}
        </div>
      ) : (
        <div
          aria-busy={isFetching}
          style={{ position: 'relative', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 12, overflow: 'hidden' }}
        >
          {/* Indeterminate rail on the card's top edge: the one loading cue that
              stays put whether the body below is skeleton or live rows. Overlaid
              rather than stacked so appearing can't nudge the table down 2px. */}
          {isFetching && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}>
              <LoadingBar />
            </div>
          )}

          {/* A refetch dims the rows it's about to replace but keeps them
              readable — blanking a table the user is mid-scan is worse. */}
          <div style={{ overflowX: 'auto', opacity: isFetching && !isFirstLoad ? 0.5 : 1, transition: 'opacity .15s ease' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} style={col.align === 'right' ? { ...th, textAlign: 'right' } : th}>{col.label}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {isFirstLoad && <SkeletonRows count={Math.min(pageSize, SKELETON_ROWS)} />}

                {!isFirstLoad && rows.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: 'var(--text-3)', textAlign: 'center', padding: 26 }} colSpan={5}>
                      {hasFilters ? 'No matches for the current filters.' : 'No duplicate-account matches found.'}
                    </td>
                  </tr>
                )}

                {rows.map((row, index) => {
                  const rowKey = `${row.subject?.id ?? 'x'}-${row.counterparty?.id ?? 'y'}-${start + index}`
                  const isOpen = !!expanded[rowKey]

                  return (
                    <Fragment key={rowKey}>
                      <tr className="row-hover">
                        <td style={td}>
                          <div style={{ fontWeight: 600 }}>{row.subject?.full_name || 'Unknown'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{row.subject?.email || `ID ${row.subject?.id ?? 'N/A'}`}</div>
                        </td>

                        <td style={td}>
                          <div style={{ fontWeight: 600 }}>{row.counterparty?.full_name || 'Unknown'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{row.counterparty?.email || `ID ${row.counterparty?.id ?? 'N/A'}`}</div>
                        </td>

                        <td style={{ ...td, textAlign: 'right', fontFamily: "'Geist Mono',monospace", fontWeight: 600 }}>
                          {row.matchCount}
                        </td>

                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {row.matchedFields.length === 0
                              ? <span style={{ color: 'var(--text-3)' }}>—</span>
                              : row.matchedFields.map((field, i) => (
                                <Chip key={`${field.field}-${i}`}>{FIELD_LABELS[field.field] || field.field}</Chip>
                              ))}
                          </div>
                        </td>

                        <td style={td}>
                          <button
                            onClick={() => toggleRow(rowKey)}
                            aria-expanded={isOpen}
                            disabled={row.matchedFields.length === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'transparent', padding: 0, font: 'inherit', fontWeight: 600, cursor: row.matchedFields.length === 0 ? 'default' : 'pointer', color: row.matchedFields.length === 0 ? 'var(--text-3)' : 'var(--accent)' }}
                          >
                            <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>›</span>
                            Evidence
                          </button>
                        </td>
                      </tr>

                      {/* Expanded detail: its own full-width row spanning every column. */}
                      {isOpen && (
                        <tr>
                          <td colSpan={5} style={{ padding: '16px 12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                              <Chip>{row.matchCount} matching field{row.matchCount === 1 ? '' : 's'}</Chip>
                              <span style={{ color: 'var(--text-2)' }}>
                                {row.subject?.full_name || 'Unknown'} ↔ {row.counterparty?.full_name || 'Unknown'}
                              </span>
                              <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>
                                {row.totalFlags} total flag{row.totalFlags === 1 ? '' : 's'} on this account
                              </span>
                            </div>

                            {/* Fields flow across the row, each label above its shared values. */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
                              {row.matchedFields.map((field, i) => (
                                <div key={`${field.field}-${i}`}>
                                  <div style={evidenceLabel}>{FIELD_LABELS[field.field] || field.field}</div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                    {(Array.isArray(field.shared) ? field.shared : [field.shared])
                                      .filter(Boolean)
                                      .map((value, j) => (
                                        <span key={j} style={valueChip}>{String(value)}</span>
                                      ))}
                                  </div>
                                  <div style={{ marginTop: 6, color: 'var(--text-3)', fontSize: 11.5 }}>
                                    Strength: {field.strength || 'unknown'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ---- pager ---- */}
          {isFirstLoad ? (
            <div style={pagerShell}>
              <SkeletonBar width={150} height={10} />
              <div style={{ flex: 1 }} />
              <SkeletonBar width={78} height={10} />
              <SkeletonBar width={186} height={10} />
            </div>
          ) : (
          <div style={pagerShell}>
            <div style={{ color: 'var(--text-2)', fontSize: 12 }}>
              {/* Three different numbers, because they are three different things:
                  the rows on screen, the pairs the fetched accounts came to, and
                  the backend's total. */}
              {rows.length === 0
                ? 'No rows'
                : `Showing ${start + 1}–${start + rows.length} of ${allRows.length} pair${allRows.length === 1 ? '' : 's'} from ${users.length} account${users.length === 1 ? '' : 's'}${total === null ? '' : ` · ${total} total`}`}
            </div>

            <div style={{ flex: 1 }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontSize: 12 }}>
              Rows
              <select
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 12 }}
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => goPage(1)} disabled={!canPrev} style={pagerBtn(!canPrev)}>« First</button>
              <button onClick={() => goPage(page - 1)} disabled={!canPrev} style={pagerBtn(!canPrev)}>‹ Prev</button>
              <span style={{ color: 'var(--text-2)', fontSize: 12, padding: '0 4px', fontFamily: "'Geist Mono',monospace" }}>
                {page}{pageCount === null ? '' : ` / ${pageCount}`}
              </span>
              <button onClick={() => goPage(page + 1)} disabled={!canNext} style={pagerBtn(!canNext)}>Next ›</button>
              {/* Jumping to the last page needs a total; without one, there's no
                  last page number to jump to. */}
              {pageCount !== null && (
                <button onClick={() => goPage(pageCount)} disabled={!canNext} style={pagerBtn(!canNext)}>Last »</button>
              )}
            </div>
          </div>
          )}
        </div>
      )}
    </section>
  )
}

export default Compliance
