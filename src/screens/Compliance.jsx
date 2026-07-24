import React, { useMemo, useState } from 'react'

const fieldDefinitions = [
  {
    key: 'surname',
    label: 'SURNAME',
    short: 'Shared last names in KYC profiles',
    title: 'Surname match review',
    description: 'Flag accounts that share a surname so the review team can check if the identities overlap.',
    matches: [
      {
        accountA: 'ACC-042',
        accountB: 'ACC-331',
        priority: 'High',
        evidence: 'KYC last name = Smith',
        signal: 'Shared surname',
        action: 'Review onboarding docs',
        rationale: 'Both users supplied the same surname in the KYC form and have different emails, which is a strong signal for account duplication.',
      },
      {
        accountA: 'ACC-907',
        accountB: 'ACC-118',
        priority: 'Medium',
        evidence: 'KYC last name = Patel',
        signal: 'Potential family match',
        action: 'Cross-check phone numbers',
        rationale: 'The surname is shared, but the profile details suggest a secondary review rather than an immediate block.',
      },
    ],
  },
  {
    key: 'address',
    label: 'ADDRESS',
    short: 'Matching addresses or postcodes',
    title: 'Address match review',
    description: 'Surface address clones even when the street name differs but the postcode or locality is the same.',
    matches: [
      {
        accountA: 'ACC-042',
        accountB: 'ACC-331',
        priority: 'Critical',
        evidence: '123 Main St, New York, NY 10001',
        signal: 'Exact address match',
        action: 'Escalate to KYC operations',
        rationale: 'The full residential address is identical, which makes this a high-confidence duplicate identity case.',
      },
      {
        accountA: 'ACC-203',
        accountB: 'ACC-611',
        priority: 'High',
        evidence: 'Postcode 10001',
        signal: 'Postcode-only overlap',
        action: 'Review address history',
        rationale: 'The street names differ, but the city and postal code match, so this still warrants a compliance review.',
      },
    ],
  },
  {
    key: 'ip',
    label: 'IP ADDRESS',
    short: 'Shared login IP addresses',
    title: 'IP address match review',
    description: 'Highlight accounts that were active from the same IP address across separate profiles.',
    matches: [
      {
        accountA: 'ACC-088',
        accountB: 'ACC-244',
        priority: 'High',
        evidence: '192.168.40.81',
        signal: 'Common login origin',
        action: 'Check VPN or device reuse',
        rationale: 'Both accounts connected from the same IP during a short time window, suggesting shared access or a proxy.',
      },
    ],
  },
  {
    key: 'cid',
    label: 'CID (Device ID)',
    short: 'Repeated device identifiers',
    title: 'CID device match review',
    description: 'Detect repeated device or browser identifiers across customer accounts.',
    matches: [
      {
        accountA: 'ACC-371',
        accountB: 'ACC-902',
        priority: 'High',
        evidence: 'CID_7701',
        signal: 'Same device ID',
        action: 'Request MFA revalidation',
        rationale: 'The same CID was observed during onboarding for both accounts, which points to shared hardware or a duplicate profile.',
      },
    ],
  },
  {
    key: 'wallet',
    label: 'CRYPTO WALLET',
    short: 'Shared wallet addresses used for eval purchases',
    title: 'Crypto wallet match review',
    description: 'Flag repeated wallet addresses that appear on more than one account.',
    matches: [
      {
        accountA: 'ACC-517',
        accountB: 'ACC-804',
        priority: 'Critical',
        evidence: '0x7Ff...a4C1',
        signal: 'Shared wallet',
        action: 'Suspend funding path',
        rationale: 'The same wallet address was used to buy eval access on two distinct accounts, which is a high-risk circumvention pattern.',
      },
    ],
  },
  {
    key: 'card',
    label: 'PAYMENT CARD',
    short: 'Shared card tokens or payment identifiers',
    title: 'Payment card match review',
    description: 'Review repeated debit or credit card identifiers across the account base.',
    matches: [
      {
        accountA: 'ACC-401',
        accountB: 'ACC-699',
        priority: 'High',
        evidence: 'Card ending 4412',
        signal: 'Reused payment instrument',
        action: 'Notify finance ops',
        rationale: 'The same payment token was used for separate purchases, making the account pair worth a manual review.',
      },
    ],
  },
]

const Compliance = () => {
  const [activeField, setActiveField] = useState('surname')

  const activeConfig = fieldDefinitions.find((item) => item.key === activeField) || fieldDefinitions[0]

  const totals = useMemo(() => {
    const totalFlags = fieldDefinitions.reduce((sum, item) => sum + item.matches.length, 0)
    const criticalFlags = fieldDefinitions.reduce(
      (sum, item) => sum + item.matches.filter((match) => match.priority === 'Critical').length,
      0,
    )
    return { totalFlags, criticalFlags }
  }, [])

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
    </section>
  )
}

export default Compliance
