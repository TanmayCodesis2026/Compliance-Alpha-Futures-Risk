import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  sevMeta, sevKey, fixMojibake, decorateFlag, detailLegs, detailGraph, detailSignals, typeHeadings,
  overviewTrendBars, decorateOverview,
} from './data.js'
import { fetchFlags, fetchFlagDetail } from './api.js'
import { useIsMobile } from './useMediaQuery.js'
import { useSession } from './useSession.js'
import Compliance1 from './screens/Compliance1.jsx'
import Compliance from './screens/Compliance.jsx'
import Login from './components/Login.jsx'
// import RunHistory from './screens/RunHistory.jsx' // parked until the runs API exists

export default function App() {
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [theme, setTheme] = useState('dark')
  const [screen, setScreen] = useState('compliance')
  // Login is the launch screen: no token -> nothing but <Login/> renders.
  // useSession keeps the token refreshed and clears it when the session dies.
  const { idToken, signIn, signOut } = useSession()
  const [search, setSearch] = useState('')
  const [sev, setSev] = useState({ critical: true, high: true, medium: true })
  const [type, setType] = useState({ 'RT-1': true, 'RT-2': true, 'GT-1': true, 'GT-2': true })
  const [accountQuery, setAccountQuery] = useState('') // account dossier deep-link
  const [modelAccount, setModelAccount] = useState('') // deep-link account → a model screen
  const [minRecurrence, setMinRecurrence] = useState(2) // R-6 gate (API default 2)
  const [dateFrom, setDateFrom] = useState('') // 'YYYY-MM-DD' inclusive, '' = no bound
  const [dateTo, setDateTo] = useState('')     // 'YYYY-MM-DD' inclusive, '' = no bound
  const [accountName, setAccountName] = useState('') // account_name filter (server-side)
  const [accountDeb, setAccountDeb] = useState('')   // debounced copy
  const [page, setPage] = useState(1)          // current page of the filtered queue
  const [pageSize, setPageSize] = useState(25) // rows per page
  const [sel, setSel] = useState({ source: null, id: null }) // selected flag for detail
  const [expanded, setExpanded] = useState({})
  const [legsByFlag, setLegsByFlag] = useState({}) // cache of detail legs per flag_id

  // ---- API state ----
  const [overview, setOverview] = useState(null)
  const [overviewErr, setOverviewErr] = useState(null)
  const [flagsData, setFlagsData] = useState(null) // { count, results }
  const [flagsLoading, setFlagsLoading] = useState(false)
  const [flagsErr, setFlagsErr] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr, setDetailErr] = useState(null)

  // sidebar nav: clear any dossier deep-link account so model screens open clean
  const go = (s) => { setModelAccount(''); setScreen(s); setDrawerOpen(false); window.scrollTo && window.scrollTo(0, 0) }
  const toggleSev = (k) => setSev((s) => ({ ...s, [k]: !s[k] }))
  const toggleType = (k) => setType((s) => ({ ...s, [k]: !s[k] }))

  const openFlag = useCallback((f) => {
    setSel({ source: f.source, id: f.id })
    setScreen('detail')
    window.scrollTo && window.scrollTo(0, 0)
  }, [])

  const toggleExpand = useCallback((flagId) => {
    setExpanded((s) => ({ ...s, [flagId]: !s[flagId] }))
  }, [])

  // open the account dossier for a given account name (from a clickable cell)
  const openAccount = useCallback((name) => {
    if (!name) return
    setAccountQuery(name)
    setScreen('account')
    window.scrollTo && window.scrollTo(0, 0)
  }, [])

  // "View all →" from a dossier section: open the matching full screen, filtered
  // to the account. Per-trade + HFT sections go to their own screens; RT/GT go to
  // Analysis (which resolves account via the shared accounts table).
  const openModelForAccount = useCallback((sectionKey, name) => {
    if (!name) return
    const map = {
      tick_scalping: 'tick', short_duration: 'short', news_trading: 'news',
      gambling: 'gambling', hft: 'hft',
    }
    if (map[sectionKey]) {
      setModelAccount(name)
      setScreen(map[sectionKey])
    } else { // reverse_trading | group_trading
      setAccountName(name)
      setMinRecurrence(1) // dossier shows all; don't re-gate the Analysis list
      setScreen('queue')
    }
    window.scrollTo && window.scrollTo(0, 0)
  }, [])

  const navGo = {
    overview: () => go('overview'),
    account: () => go('account'),
    queue: () => go('queue'),
    detail: () => go('detail'),
    tick: () => go('tick'),
    short: () => go('short'),
    hft: () => go('hft'),
    news: () => go('news'),
    gambling: () => go('gambling'),
    events: () => go('events'),
    compliance1: () => go('compliance1'),
    compliance: () => go('compliance'),
    logs: () => go('logs'),
    history: () => go('history'),
  }

  // ---- auth ----
  const handleLogin = (data, remember) => {
    signIn(data, remember)
    go('compliance')
  }

  const handleLogout = () => {
    signOut()
    setScreen('compliance') // where we land on the next successful sign-in
  }

  // ---- overview fetch parked: fetchOverview() is commented out in api.js ----
  // When it comes back, restore the effect keyed on [idToken] so it fires once
  // the session exists rather than on mount. `overview` stays null meanwhile,
  // which the derived values below already tolerate.

  // ---- fetch flags when on queue screen or filters/search change ----
  // The API takes a single value per param. We push the narrowest server filter
  // we can and finish any leftover narrowing client-side:
  //   - exactly one type        -> flag_type=<code>
  //   - exactly one whole family -> source=reverse_trading | group_trading
  //     (covers the common "RT-1 + RT-2" / "GT-1 + GT-2" selections server-side)
  //   - a cross-family subset    -> no server type filter; narrow on the page
  const sevSelected = Object.keys(sev).filter((k) => sev[k])
  const typeSelected = Object.keys(type).filter((k) => type[k])
  const serverSeverity = sevSelected.length === 1 ? sevSelected[0].toUpperCase() : undefined
  const RT = ['RT-1', 'RT-2'], GT = ['GT-1', 'GT-2']
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))
  let serverType, serverSource
  if (typeSelected.length === 1) serverType = typeSelected[0]
  else if (sameSet(typeSelected, RT)) serverSource = 'reverse_trading'
  else if (sameSet(typeSelected, GT)) serverSource = 'group_trading'

  // debounce the account_name text filter
  useEffect(() => {
    const t = setTimeout(() => setAccountDeb(accountName.trim()), 300)
    return () => clearTimeout(t)
  }, [accountName])

  // Reset to page 1 whenever the server-side query changes (otherwise we could
  // request a page number that no longer exists for the new result set).
  useEffect(() => { setPage(1) }, [serverSeverity, serverType, serverSource, search, dateFrom, dateTo, accountDeb, minRecurrence])

  // ---- fetch the current page from the API on every page/filter change ----
  // Server-side pagination + filtering. The API honors severity / flag_type /
  // search / date_from / date_to / account_name + page / page_size. Only
  // multi-select severity/type (single-value API) is narrowed client-side.
  useEffect(() => {
    if (screen !== 'queue') return
    let alive = true
    setFlagsLoading(true)
    fetchFlags({
      severity: serverSeverity,
      flag_type: serverType,
      source: serverSource,
      search: search.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      account_name: accountDeb || undefined,
      min_recurrence: minRecurrence,
      page,
      page_size: pageSize,
    })
      .then((d) => { if (alive) { setFlagsData(d); setFlagsErr(null) } })
      .catch((e) => { if (alive) { setFlagsErr(e.message); setFlagsData(null) } })
      .finally(() => { if (alive) setFlagsLoading(false) })
    return () => { alive = false }
  }, [screen, serverSeverity, serverType, serverSource, search, dateFrom, dateTo, accountDeb, minRecurrence, page, pageSize])

  // ---- fetch detail when a flag is selected ----
  useEffect(() => {
    if (screen !== 'detail' || !sel.source || sel.id == null) return
    let alive = true
    setDetailLoading(true)
    fetchFlagDetail(sel.source, sel.id)
      .then((d) => { if (alive) { setDetail(d); setDetailErr(null) } })
      .catch((e) => { if (alive) { setDetailErr(e.message); setDetail(null) } })
      .finally(() => { if (alive) setDetailLoading(false) })
    return () => { alive = false }
  }, [screen, sel.source, sel.id])

  // ---- lazily load legs (constituent trades) for an expanded queue row ----
  useEffect(() => {
    const openIds = Object.keys(expanded).filter((id) => expanded[id])
    openIds.forEach((flagId) => {
      if (legsByFlag[flagId]) return
      const row = (flagsData?.results || []).find((r) => r.flag_id === flagId)
      if (!row) return
      fetchFlagDetail(row.source, row.id)
        .then((d) => setLegsByFlag((m) => ({ ...m, [flagId]: detailLegs(d) })))
        .catch(() => setLegsByFlag((m) => ({ ...m, [flagId]: [] })))
    })
  }, [expanded, flagsData, legsByFlag])

  // ---- decorate the current server page + apply page-local client filters ----
  const deco = (f) => {
    const d = decorateFlag(f, { expanded, toggleExpand, openFlag })
    d.legs = legsByFlag[f.flag_id] || null
    return d
  }
  // Date range is now server-side. Only multi-select severity/type (which the
  // single-value API can't express) is narrowed client-side on the page.
  const clientMatch = (f) => sev[sevKey(f.severity)] && type[f.flag_type]
  const rows = (flagsData?.results || []).filter(clientMatch).map(deco)

  // ---- server-driven pagination (count comes from the API) ----
  const total = flagsData?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const pageStart = (page - 1) * pageSize
  const pageInfo = {
    page,
    pageCount,
    pageSize,
    total,
    from: total === 0 ? 0 : pageStart + 1,
    to: Math.min(pageStart + pageSize, total),
    setPage,
    setPageSize: (n) => { setPageSize(n); setPage(1) },
    prev: () => setPage((p) => Math.max(1, p - 1)),
    next: () => setPage((p) => Math.min(pageCount, p + 1)),
  }

  // ---- overview-derived render values ----
  const ov = overview
  const trendBars = useMemo(() => (ov ? overviewTrendBars(ov) : []), [ov])
  const ovd = useMemo(() => decorateOverview(ov), [ov])
  const topRows = (ov?.recent_high_critical || []).map(deco)

  // ---- nav active styling ----
  const navStyles = {}
    ;['overview', 'account', 'queue', 'detail', 'tick', 'short', 'hft', 'news', 'gambling', 'events', 'logs', 'history'].forEach((k) => {
      navStyles[k] = screen === k
        ? { bg: 'var(--accent-soft)', fg: 'var(--accent)' }
        : { bg: 'transparent', fg: 'var(--text-2)' }
    })
  const openFlagsBadge = ovd ? String(ovd.totals.flags ?? '—') : '…'
  const accountsLabel = ovd ? (ovd.totals.accounts ?? 0).toLocaleString() : '…'

  // ---- sev / type filter chips ----
  const chip = (active, color, soft) => active
    ? { border: color, bg: soft, fg: color }
    : { border: 'var(--border)', bg: 'transparent', fg: 'var(--text-3)' }
  const sevChips = [
    { key: 'critical', label: 'Critical' }, { key: 'high', label: 'High' }, { key: 'medium', label: 'Medium' },
  ].map((c) => ({ label: c.label, toggle: () => toggleSev(c.key), ...chip(sev[c.key], sevMeta[c.key].color, sevMeta[c.key].soft) }))
  const typeChips = ['RT-1', 'RT-2', 'GT-1', 'GT-2'].map((t) => ({
    label: t, toggle: () => toggleType(t), ...chip(type[t], 'var(--accent)', 'var(--accent-soft)'),
  }))

  // ---- investigation render values (from detail payload) ----
  const detSev = detail ? (sevMeta[sevKey(detail.severity)] || sevMeta.medium) : null
  const selView = detail ? {
    id: detail.flag_id, pk: detail.id, type: detail.flag_type,
    sevColor: detSev.color, sevSoft: detSev.soft, sevLabel: detSev.label,
    headline: fixMojibake(detail.flag_type_display) || typeHeadings[detail.flag_type] || '',
    typeDisplay: fixMojibake(detail.flag_type_display) || '',
    instruments: (detail.instruments || []).join(' / '),
    users: (detail.user_ids || []).join(' · '),
    userIds: detail.user_ids || [],
    numUsers: detail.num_users,
    direction: detail.direction,
    recurrence: detail.recurrence,
    tradeIds: detail.trade_ids || [],
    created: detail.created_at ? new Date(detail.created_at).toLocaleString() : '—',
    updated: detail.updated_at ? new Date(detail.updated_at).toLocaleString() : '—',
    // RT/GT detail extras (present per source)
    userEmails: detail.user_emails || [],          // [{ user_id, email }]
    occurrences: detail.occurrences || [],         // RT: prior occurrences
    trades: detail.trades || [],                   // GT: live constituent trades
    tradesNote: detail.trades_note || '',
  } : null
  const signals = detail ? detailSignals(detail) : []
  const detLegs = detail ? detailLegs(detail) : []
  const detGraph = detail ? detailGraph(detail) : null

  // Run History is parked ("coming soon") until a runs API exists. Its derived
  // logic lives in historyVals() (data.js) + RunHistory.jsx for when it returns.

  const themeLabel = theme === 'light' ? 'Dark' : 'Light'
  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  // ---- login gate: first thing rendered on launch, no app chrome around it ----
  // Placed after every hook above so hook order stays identical across renders.
  if (!idToken) {
    return (
      <div data-theme={theme} style={{ fontFamily: "'Geist',system-ui,-apple-system,sans-serif", fontSize: 13, lineHeight: 1.45, letterSpacing: '-0.005em', WebkitFontSmoothing: 'antialiased' }}>
        <Login onLogin={handleLogin} />
      </div>
    )
  }

  return (
    <div data-theme={theme} style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Geist',system-ui,-apple-system,sans-serif", fontSize: 13, lineHeight: 1.45, letterSpacing: '-0.005em', WebkitFontSmoothing: 'antialiased' }}>

      {/* backdrop behind the mobile drawer */}
      {isMobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40 }} />
      )}

      {/* ===================== SIDEBAR ===================== */}
      <aside style={isMobile
        ? { width: 264, flex: 'none', borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: 'auto', zIndex: 50, transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .22s ease', boxShadow: drawerOpen ? 'var(--shadow-lg)' : 'none' }
        : { width: 248, flex: 'none', borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        <div style={{ padding: '12px 18px 12px', display: 'flex', alignItems: 'center', gap: 11, borderBottom: '1px solid var(--hair)' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <div style={{ width: 13, height: 13, border: '2.5px solid var(--accent-fg)', borderRadius: '50%', borderRightColor: 'transparent', transform: 'rotate(-45deg)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: '-0.01em', lineHeight: 1.1 }}>Compliance tool</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'Geist Mono',monospace", letterSpacing: 0 }}>Alpha Capital</div>
          </div>
        </div>

        <nav style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', padding: '8px 10px 6px', textTransform: 'uppercase' }}>Monitoring</div>
          <button className="nav-btn" onClick={navGo.overview} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.overview.bg, color: navStyles.overview.fg }}>
            Overview
          </button>
          <button className="nav-btn" onClick={navGo.account} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.account.bg, color: navStyles.account.fg }}>
            Account Search
          </button>
          <button className="nav-btn" onClick={navGo.queue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.queue.bg, color: navStyles.queue.fg }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>Analysis</span>
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, fontWeight: 600, background: 'var(--crit-soft)', color: 'var(--crit)', padding: '1px 6px', borderRadius: 20 }}>{openFlagsBadge}</span>
          </button>
          <button className="nav-btn" onClick={navGo.detail} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.detail.bg, color: navStyles.detail.fg }}>
            Investigation
          </button>
          <button className="nav-btn" onClick={navGo.logs} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.logs.bg, color: navStyles.logs.fg }}>
            System &amp; Logs
          </button>
          <button className="nav-btn" onClick={navGo.history} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.history.bg, color: navStyles.history.fg }}>
            <span>Run History</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)', background: 'var(--inset)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 20 }}>Soon</span>
          </button>

          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', padding: '16px 10px 6px', textTransform: 'uppercase' }}>Detection models</div>
          <button className="nav-btn" onClick={navGo.tick} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.tick.bg, color: navStyles.tick.fg }}>
            Tick Scalping
          </button>
          <button className="nav-btn" onClick={navGo.short} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.short.bg, color: navStyles.short.fg }}>
            Short Duration
          </button>
          <button className="nav-btn" onClick={navGo.hft} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.hft.bg, color: navStyles.hft.fg }}>
            HFT
          </button>
          <button className="nav-btn" onClick={navGo.news} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.news.bg, color: navStyles.news.fg }}>
            News Trading
          </button>
          <button className="nav-btn" onClick={navGo.gambling} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.gambling.bg, color: navStyles.gambling.fg }}>
            Gambling
          </button> */}

          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', padding: '16px 10px 6px', textTransform: 'uppercase' }}>Reference</div>
          {/* <button className="nav-btn" onClick={navGo.compliance1} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: screen === 'compliance1' ? 'var(--accent-soft)' : 'transparent', color: screen === 'compliance1' ? 'var(--accent)' : 'var(--text-2)' }}>
            Old Compliance
          </button> */}
          <button className="nav-btn" onClick={navGo.compliance} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: screen === 'compliance' ? 'var(--accent-soft)' : 'transparent', color: screen === 'compliance' ? 'var(--accent)' : 'var(--text-2)' }}>
            Compliance 
          </button>
          {/* <button className="nav-btn" onClick={navGo.events} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontWeight: 500, textAlign: 'left', background: navStyles.events.bg, color: navStyles.events.fg }}>
            News Events
          </button> */}

          {/* <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-3)', padding: '16px 10px 6px', textTransform: 'uppercase' }}>Configured rules</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', color: 'var(--text-2)', fontSize: 12 }}><span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 600, color: 'var(--crit)', width: 34 }}>RT-1</span>Reverse · 2 users</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', color: 'var(--text-2)', fontSize: 12 }}><span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 600, color: 'var(--crit)', width: 34 }}>RT-2</span>Correlated hedge</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', color: 'var(--text-2)', fontSize: 12 }}><span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 600, color: 'var(--high)', width: 34 }}>GT-1</span>Same direction</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', color: 'var(--text-2)', fontSize: 12 }}><span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 600, color: 'var(--high)', width: 34 }}>GT-2</span>Opposite sides</div>
          </div> */}
        </nav>

        <div style={{ marginTop: 'auto', padding: 14, borderTop: '1px solid var(--hair)', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flex: 'none' }}>AA</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Alpha Admin</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Compliance Team</div>
          </div>
          <button onClick={handleLogout} title="Sign out" style={{ flex: 'none', padding: '5px 9px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 6, cursor: 'pointer', font: 'inherit', fontSize: 11, color: 'var(--text-2)' }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ===================== MAIN ===================== */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'auto' }}>

        {/* topbar */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, padding: isMobile ? '10px 16px' : '12px 26px', background: 'color-mix(in srgb, var(--surface) 82%, transparent)', backdropFilter: 'saturate(1.4) blur(10px)', borderBottom: '1px solid var(--border)' }}>
          {isMobile && (
            <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          )}
          {/* <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 380, background: 'var(--inset)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 11px' }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flex: 'none' }}><circle cx="6.3" cy="6.3" r="4.6" stroke="var(--text-3)" strokeWidth="1.5" /><line x1="9.7" y1="9.7" x2="13.5" y2="13.5" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flag IDs…" style={{ border: 'none', background: 'transparent', outline: 'none', font: 'inherit', color: 'var(--text)', width: '100%' }} />
          </div> */}
          <div style={{ flex: 1 }} />
          <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-2)', padding: '4px 11px', border: '1px solid var(--border)', borderRadius: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', animation: 'pulse 1.8s ease-in-out infinite', flex: 'none' }} />
            Live · <span style={{ fontFamily: "'Geist Mono',monospace" }}>{accountsLabel}</span> accounts
          </div>
          <button className="theme-btn" onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 6, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
            <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid currentColor', background: 'linear-gradient(90deg, currentColor 50%, transparent 50%)', display: 'inline-block' }} />{themeLabel}
          </button>
        </div>

        {screen === 'overview' && (
          <Overview navGo={navGo} ov={ovd} trendBars={trendBars} topRows={topRows} error={overviewErr} loading={!ov && !overviewErr} />
        )}
        {screen === 'account' && <AccountSummary initialAccount={accountQuery} onViewAll={openModelForAccount} />}
        {screen === 'queue' && (
          <Analysis
            rows={rows} noRows={!flagsLoading && rows.length === 0}
            sevChips={sevChips} typeChips={typeChips}
            dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
            accountName={accountName} setAccountName={setAccountName}
            minRecurrence={minRecurrence} setMinRecurrence={setMinRecurrence}
            onAccountClick={openAccount}
            loading={flagsLoading} error={flagsErr} pageInfo={pageInfo}
          />
        )}
        {screen === 'detail' && (
          <Investigation
            navGo={navGo} sel={selView} signals={signals} legs={detLegs} graph={detGraph}
            onAccountClick={openAccount}
            loading={detailLoading} error={detailErr} empty={!sel.source}
          />
        )}
        {screen === 'tick' && <TickScalping onAccountClick={openAccount} initialAccount={modelAccount} />}
        {screen === 'short' && <ShortDuration onAccountClick={openAccount} initialAccount={modelAccount} />}
        {screen === 'hft' && <Hft initialAccount={modelAccount} />}
        {screen === 'news' && <NewsTrading onAccountClick={openAccount} initialAccount={modelAccount} />}
        {screen === 'gambling' && <Gambling onAccountClick={openAccount} initialAccount={modelAccount} />}
        {screen === 'compliance1' && <Compliance1/>}
        {screen === 'compliance' && <Compliance/>}
        {screen === 'events' && <NewsEvents />}
        {screen === 'logs' && <Logs />}
        {screen === 'history' && (
          <ComingSoon title="Run History" />
        )}
      </main>
    </div>
  )
}
