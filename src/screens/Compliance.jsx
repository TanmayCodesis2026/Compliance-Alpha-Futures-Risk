import { Fragment, useEffect, useMemo, useState } from 'react'
import { getToken, isTokenExpired, refreshToken } from '../auth.js'

const API_URL = 'https://backend.alphacapitalgroup.uk/admin/compliance/duplicates/all/'

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

// The payload is either a bare array or wrapped — same shapes Compliance.jsx handles.
const normalizeUsers = (payload) => {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.results)) return payload.results
  if (payload && Array.isArray(payload.users)) return payload.users
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

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

const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td = { padding: '12px', borderBottom: '1px solid var(--hair)', color: 'var(--text)', verticalAlign: 'top' }

// Evidence lays out horizontally in the expanded row: one labelled column per
// matched field, shared values inline beneath the label.
const evidenceLabel = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)' }
const valueChip = { padding: '2px 8px', borderRadius: 6, background: 'var(--inset)', color: 'var(--text-2)', fontFamily: "'Geist Mono',monospace", fontSize: 11.5, whiteSpace: 'nowrap' }

const pagerBtn = (disabled) => ({
  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface)', color: disabled ? 'var(--text-3)' : 'var(--text-2)',
  cursor: disabled ? 'default' : 'pointer', font: 'inherit', fontSize: 12,
})

function Compliance() {
  const [complianceData, setComplianceData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [expanded, setExpanded] = useState({}) // rowKey -> open

  const toggleRow = (rowKey) => setExpanded((s) => ({ ...s, [rowKey]: !s[rowKey] }))

  useEffect(() => {
    let alive = true

    const load = async (accessToken, { retried = false } = {}) => {
      const response = await fetch(API_URL, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        console.error('Compliance fetch failed', response.status, response.statusText, text)

        // One refresh attempt only — `retried` stops a 401-refresh-401 loop.
        if ((response.status === 401 || response.status === 403) && !retried) {
          const fresh = await refreshToken()
          if (fresh && alive) return load(fresh, { retried: true })
        }

        if (alive) {
          setErrorMessage('Unable to load compliance matches from the API.')
          setIsLoading(false)
        }
        return
      }

      const data = await response.json()
      if (!alive) return
      setComplianceData(data)
      setErrorMessage('')
      setIsLoading(false)
    }

    const token = getToken()
    if (!token || isTokenExpired()) {
      // App gates this screen behind Login, so a missing/expired token here means
      // the session lapsed while the tab was open.
      refreshToken().then((fresh) => {
        if (!alive) return
        if (!fresh) {
          setErrorMessage('Your session has expired. Please sign in again.')
          setIsLoading(false)
          return
        }
        load(fresh).catch((err) => {
          if (alive) { setErrorMessage(err?.message || 'Unable to load compliance matches.'); setIsLoading(false) }
        })
      })
    } else {
      load(token).catch((err) => {
        if (alive) { setErrorMessage(err?.message || 'Unable to load compliance matches.'); setIsLoading(false) }
      })
    }

    return () => { alive = false }
  }, [])

  const users = useMemo(() => normalizeUsers(complianceData), [complianceData])
  const rows = useMemo(() => flattenPairs(users), [users])

  // ---- pagination (client-side: the endpoint is /all/ and returns everything) ----
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages) // clamp on render instead of resetting in an effect
  const start = (safePage - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  const goPage = (n) => setPage(Math.min(Math.max(1, n), totalPages))
  const changePageSize = (n) => { setPageSize(n); setPage(1) }

  return (
    <section style={{ padding: 26, flex: 1 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Compliance</h1>
        <div style={{ marginTop: 6, color: 'var(--text-2)' }}>
          Duplicate-account matches across surname, address, IP, CID, wallet and card.
        </div>
      </div>

      {isLoading && (
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 12, padding: 22, color: 'var(--text-2)' }}>
          Loading compliance data…
        </div>
      )}

      {!isLoading && errorMessage && (
        <div style={{ border: '1px solid var(--crit)', background: 'var(--crit-soft)', borderRadius: 12, padding: 22, color: 'var(--crit)' }}>
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && (
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Account</th>
                  <th style={th}>Matched With</th>
                  <th style={{ ...th, textAlign: 'right' }}>Match Count</th>
                  <th style={th}>Matched Fields</th>
                  <th style={th}>Details</th>
                </tr>
              </thead>

              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: 'var(--text-3)', textAlign: 'center', padding: 26 }} colSpan={5}>
                      No duplicate-account matches found.
                    </td>
                  </tr>
                )}

                {pageRows.map((row, index) => {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ color: 'var(--text-2)', fontSize: 12 }}>
              {rows.length === 0
                ? 'No rows'
                : `Showing ${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length}`}
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
              <button onClick={() => goPage(1)} disabled={safePage === 1} style={pagerBtn(safePage === 1)}>« First</button>
              <button onClick={() => goPage(safePage - 1)} disabled={safePage === 1} style={pagerBtn(safePage === 1)}>‹ Prev</button>
              <span style={{ color: 'var(--text-2)', fontSize: 12, padding: '0 4px', fontFamily: "'Geist Mono',monospace" }}>
                {safePage} / {totalPages}
              </span>
              <button onClick={() => goPage(safePage + 1)} disabled={safePage === totalPages} style={pagerBtn(safePage === totalPages)}>Next ›</button>
              <button onClick={() => goPage(totalPages)} disabled={safePage === totalPages} style={pagerBtn(safePage === totalPages)}>Last »</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default Compliance
