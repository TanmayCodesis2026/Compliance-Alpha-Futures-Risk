import React, { useMemo, useState, useEffect } from 'react'
// import { getRequestHeaders } from '../api.js'

const FIELD_MAP = {
  SURNAME_FLAG: {
    key: 'surname',
    label: 'Surname',
    short: 'Matching last names',
    title: 'Surname Matches',
    description: 'Accounts sharing the same surname.',
  },
  ADDRESS_FLAG: {
    key: 'address',
    label: 'Address',
    short: 'Shared addresses',
    title: 'Address Matches',
    description: 'Accounts registered using the same address.',
  },
  IP_FLAG: {
    key: 'ip',
    label: 'IP Address',
    short: 'Shared IP history',
    title: 'IP Matches',
    description: 'Accounts using identical IP addresses.',
  },
  CID_FLAG: {
    key: 'cid',
    label: 'CID',
    short: 'Shared Client IDs',
    title: 'CID Matches',
    description: 'Accounts sharing browser/client identifiers.',
  },
  MT5_CID_FLAG: {
    key: 'mt5',
    label: 'MT5 CID',
    short: 'Shared MT5 identifiers',
    title: 'MT5 CID Matches',
    description: 'Accounts sharing MT5 client IDs.',
  },
  CRYPTO_FLAG: {
    key: 'crypto',
    label: 'Crypto Wallet',
    short: 'Shared wallets',
    title: 'Crypto Wallet Matches',
    description: 'Accounts sharing cryptocurrency wallets.',
  },
  PAYMENT_FLAG: {
    key: 'payment',
    label: 'Payment Card',
    short: 'Shared payment methods',
    title: 'Payment Matches',
    description: 'Accounts sharing payment cards.',
  },
}

const normalizeUsers = (payload) => {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.results)) return payload.results
  if (payload && Array.isArray(payload.users)) return payload.users
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

const buildFieldDefinitions = (users) => {
  return Object.entries(FIELD_MAP).map(([flagKey, config]) => {
    const matches = []

    users.forEach((user) => {
      if (!user?.flags?.[flagKey]) return

      ;(user.matches || []).forEach((match) => {
        const matchedField = (match.matched_fields || []).find((fieldMatch) => {
          switch (flagKey) {
            case 'SURNAME_FLAG':
              return fieldMatch.field === 'surname'
            case 'ADDRESS_FLAG':
              return fieldMatch.field === 'address' || fieldMatch.field === 'postcode'
            case 'IP_FLAG':
              return fieldMatch.field === 'ip'
            case 'CID_FLAG':
              return fieldMatch.field === 'cid'
            case 'MT5_CID_FLAG':
              return fieldMatch.field === 'mt5_cid'
            case 'CRYPTO_FLAG':
              return fieldMatch.field === 'crypto'
            case 'PAYMENT_FLAG':
              return fieldMatch.field === 'payment'
            default:
              return false
          }
        })

        if (!matchedField) return

        matches.push({
          accountA: `${user?.user?.full_name || 'Unknown'} (${user?.user?.id ?? 'N/A'})`,
          accountB: match?.user ? `${match.user.full_name || 'Unknown'} (${match.user.id ?? 'N/A'})` : 'Unknown User',
          evidence: Array.isArray(matchedField.shared) ? matchedField.shared.join(', ') : matchedField.shared || 'No evidence',
          signal: matchedField.field?.toUpperCase() || config.label,
          action: match.match_count >= 4 ? 'Immediate Review' : match.match_count >= 2 ? 'Manual Review' : 'Monitor',
          priority: match.match_count >= 4 ? 'Critical' : match.match_count >= 2 ? 'High' : 'Medium',
          rationale: `${match.match_count || 0} matching field(s). Strength: ${matchedField.strength || 'unknown'}.`,
        })
      })
    })

    return { ...config, matches }
  })
}

const Compliance1 = () => {
  const [activeField, setActiveField] = useState('surname')
  const [token, setToken] = useState(null)
  const [complianceData, setComplianceData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const saveTokenData = (data) => {
    const expiryValue = data?.expiresIn ?? data?.expires_in
    const expiresAt = expiryValue ? Date.now() + Number(expiryValue) * 1000 : Date.now() + 60 * 60 * 1000

    localStorage.setItem('idToken', data?.idToken || data?.id_token || '')
    localStorage.setItem('refreshToken', data?.refreshToken || data?.refresh_token || '')
    localStorage.setItem('expiresAt', expiresAt.toString())
    setToken(data?.idToken || data?.id_token || null)
  }

  const isTokenExpired = () => {
    const expiresAt = localStorage.getItem('expiresAt')
    if (!expiresAt) return true
    return Date.now() >= Number(expiresAt)
  }

  const EmailSignIn = async () => {
    setIsLoading(true)
    setErrorMessage('')

    const URL = 'https://backend.alphacapitalgroup.uk/adm/email/signin/'
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'yuvraj@codesis.tech',
        password: 'YuVi@10_01_21',
      }),
      credentials: 'include',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('Email Sign-In failed', res.status, res.statusText, text)
      setErrorMessage('Unable to sign in to the compliance service.')
      setIsLoading(false)
      return
    }
    

    const data = await res.json()
    saveTokenData(data)
    await fetchComplianceData(data?.idToken || data?.id_token || null)
  }

  const fetchComplianceData = async (accessToken) => {
    const URL = 'https://backend.alphacapitalgroup.uk/admin/compliance/duplicates/all/'
    const response = await fetch(URL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'include',
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('Compliance fetch failed', response.status, response.statusText, text)

      if (response.status === 401 || response.status === 403) {
        const refreshed = await refreshToken()
        if (refreshed) {
          return fetchComplianceData(localStorage.getItem('idToken'))
        }
      }

      setErrorMessage('Unable to load compliance matches from the API.')
      setIsLoading(false)
      return
    }

    const data = await response.json()
    setComplianceData(data)
    setIsLoading(false)
  }

  const refreshToken = async () => {
    const refreshValue = localStorage.getItem('refreshToken')
    if (!refreshValue) {
      setErrorMessage('No refresh token available.')
      return false
    }

    const URL = 'https://backend.alphacapitalgroup.uk/get/refreshtoken/'
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshValue}`,
      },
      credentials: 'include',
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error('Token refresh failed', response.status, response.statusText, data)
      return false
    }

    saveTokenData(data)
    return true
  }

  useEffect(() => {
    const initialize = async () => {
      if (!isTokenExpired()) {
        await fetchComplianceData(localStorage.getItem('idToken'))
        return
      }

      await EmailSignIn()
    }

    initialize()
  }, [])

  const users = useMemo(() => normalizeUsers(complianceData), [complianceData])

  const totals = useMemo(() => ({
    totalFlags: users.reduce((sum, user) => sum + (user.total_flags || 0), 0),
    criticalFlags: users.filter((user) => (user.total_flags || 0) >= 4).length,
  }), [users])

  const fieldDefinitions = useMemo(() => buildFieldDefinitions(users), [users])

  const activeConfig = fieldDefinitions.find((item) => item.key === activeField) || fieldDefinitions[0]

  return (
    <section style={{ padding: '24px 30px 46px', color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
            Compliance workspace
          </div>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2, color: 'var(--text)' }}>Cross-account matching and review</h1>
          <p style={{ margin: '8px 0 0', maxWidth: 760, color: 'var(--text-2)', lineHeight: 1.65 }}>
            This compliance tab surfaces suspicious pairs by comparing six identity markers. Selecting a field reveals the matching flags that need review.
          </p>
        </div>
        <div style={{ minWidth: 190, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Open review queue</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{totals.totalFlags}</span>
            <span style={{ color: 'var(--text-2)' }}>flagged instances</span>
          </div>
          <div style={{ marginTop: 10, color: 'var(--crit)', fontSize: 13 }}>
            {totals.criticalFlags} critical reviews pending
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Identity checks</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>6</div>
          <div style={{ color: 'var(--text-2)', marginTop: 4 }}>Surname, address, IP, CID, wallet, card</div>
        </div>
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Signals tracked</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>13</div>
          <div style={{ color: 'var(--text-2)', marginTop: 4 }}>Suspicious account pairs surfaced</div>
        </div>
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Manual action</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>Fast</div>
          <div style={{ color: 'var(--text-2)', marginTop: 4 }}>One click to review evidence and assign action</div>
        </div>
      </div>

      {isLoading && (
        <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14, color: 'var(--text-2)' }}>
          Loading compliance data...
        </div>
      )}

      {errorMessage && (
        <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--crit)', background: 'var(--surface)', borderRadius: 14, color: 'var(--crit)' }}>
          {errorMessage}
        </div>
      )}

      {!isLoading && !errorMessage && (
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 20, marginTop: 24 }}>
        <aside style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 16, padding: 12, boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', margin: '6px 8px 10px' }}>
            Check categories
          </div>
          {fieldDefinitions.map((field) => {
            const isActive = field.key === activeField
            return (
              <button
                key={field.key}
                onClick={() => setActiveField(field.key)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: isActive ? '1px solid var(--accent-line)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                  borderRadius: 12,
                  padding: '12px 12px',
                  marginBottom: 8,
                  cursor: 'pointer',
                  color: isActive ? 'var(--text)' : 'var(--text-2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{field.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{field.matches.length}</span>
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: isActive ? 'var(--text-2)' : 'var(--text-3)' }}>{field.short}</div>
              </button>
            )
          })}
        </aside>

        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)' }}>{activeConfig.label}</div>
              <h2 style={{ margin: '4px 0 6px', fontSize: 22 }}>{activeConfig.title}</h2>
              <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 680 }}>{activeConfig.description}</p>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '7px 12px', fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)' }}>
              {activeConfig.matches.length} flagged instances
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
            {activeConfig.matches.map((match, index) => {
              const pillColor = match.priority === 'Critical' ? 'var(--crit)' : match.priority === 'High' ? 'var(--high)' : 'var(--med)'
              const pillBg = match.priority === 'Critical' ? 'var(--crit-soft)' : match.priority === 'High' ? 'var(--high-soft)' : 'var(--med-soft)'
              return (
                <article key={`${activeConfig.key}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--surface-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Pair review</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{match.accountA} ↔ {match.accountB}</div>
                    </div>
                    <span style={{ border: `1px solid ${pillColor}`, background: pillBg, color: pillColor, borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 700 }}>
                      {match.priority}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
                    <div>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)' }}>Evidence</div>
                      <div style={{ marginTop: 4, color: 'var(--text)', fontWeight: 600 }}>{match.evidence}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)' }}>Signal</div>
                      <div style={{ marginTop: 4, color: 'var(--text)', fontWeight: 600 }}>{match.signal}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)' }}>Action</div>
                      <div style={{ marginTop: 4, color: 'var(--text)', fontWeight: 600 }}>{match.action}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', marginBottom: 4 }}>Rationale</div>
                    <div style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{match.rationale}</div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
      )}
    </section>
  )
}

export default Compliance1
