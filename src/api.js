// Thin client for the Risk Tracker API (RT/GT Surveillance).
//
// Dev: import.meta.env.DEV is true → use relative "/api", which Vite proxies to
//      VITE_API_BASE (configured in vite.config.js) to avoid CORS.
// Prod: call VITE_API_BASE directly.

const BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

async function get(path, params) {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail || '' } catch { /* ignore */ }
    throw new Error(detail || `Request failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// GET /api/overview/
export function fetchOverview() {
  return get('/api/overview/')
}

// GET /api/flags/ — paginated, filterable. One request per page (server-side
// pagination). opts: { severity, flag_type, source, search, user_id, account_name,
// date_from, date_to, min_recurrence, page, page_size }
export function fetchFlags(opts = {}) {
  return get('/api/flags/', opts)
}

// GET /api/account-summary/?account_name=… — per-account dossier: summary +
// one { total, results } section per violation type. opts: { limit }
export function fetchAccountSummary(accountName, opts = {}) {
  return get('/api/account-summary/', { account_name: accountName, ...opts })
}

// GET /api/flags/{source}/{id}/
export function fetchFlagDetail(source, id) {
  return get(`/api/flags/${encodeURIComponent(source)}/${encodeURIComponent(id)}/`)
}

// ---- additional flag models (one resource endpoint each) ----
// GET /api/tick-scalping-flags/ — opts: { flag_type, search, account_name, instrument, trade_id, trade_date, profitable, ordering, page, page_size }
export function fetchTickScalping(opts = {}) {
  return get('/api/tick-scalping-flags/', opts)
}
// GET /api/short-duration-flags/ — opts: { flag_type, search, account_name, instrument, trade_id, trade_date, ordering, page, page_size }
export function fetchShortDuration(opts = {}) {
  return get('/api/short-duration-flags/', opts)
}
// GET /api/hft-flags/ — opts: { severity, flag_type, search, trade_date, ordering, page, page_size }
export function fetchHft(opts = {}) {
  return get('/api/hft-flags/', opts)
}
// GET /api/hft-flags/{id}/ — adds participating `accounts` not present on the list row.
export function fetchHftDetail(id) {
  return get(`/api/hft-flags/${encodeURIComponent(id)}/`)
}
// GET /api/news-trading-flags/ — opts: { flag_type, severity, search, account_name, instrument, trade_id, trade_date, ordering, page, page_size }
export function fetchNewsTrading(opts = {}) {
  return get('/api/news-trading-flags/', opts)
}
// GET /api/gambling-flags/ — opts: { flag_type, search, account_name, user_id, instrument, trade_id, trade_date, ordering, page, page_size }
export function fetchGambling(opts = {}) {
  return get('/api/gambling-flags/', opts)
}
// GET /api/news-events/ — opts: { country, impact, search, date_from, date_to, ordering, page, page_size }
export function fetchNewsEvents(opts = {}) {
  return get('/api/news-events/', opts)
}

// ---- system / logs (mounted at site root, not under /api) ----
// GET /logs/ — { count, logs: [...] }
export function fetchLogs() {
  return get('/logs/')
}
