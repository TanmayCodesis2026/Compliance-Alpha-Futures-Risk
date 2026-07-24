// Adapters mapping the Risk Tracker API shapes onto the render-ready props the
// screen components expect, plus static helpers for the (API-less) Run History
// screen. The original mock data set has been replaced by live API calls.

export const sevMeta = {
  critical: { label: 'CRITICAL', color: 'var(--crit)', soft: 'var(--crit-soft)' },
  high:     { label: 'HIGH',     color: 'var(--high)', soft: 'var(--high-soft)' },
  medium:   { label: 'MEDIUM',   color: 'var(--med)',  soft: 'var(--med-soft)' },
};

// API severities are upper-case (CRITICAL/HIGH/MEDIUM); normalise to our keys.
export const sevKey = (s) => (s || '').toLowerCase();

// The API double-encodes UTF-8 in some label strings: the original UTF-8 bytes
// were decoded as Windows-1252, so "·" arrives as "Â·" and "≥" as "â‰¥".
// Repair = reverse the CP1252 decode (char -> original byte) then decode UTF-8.
// CP1252 differs from Latin1 only in 0x80–0x9F; map those codepoints back.
const CP1252_REV = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};
export function fixMojibake(s) {
  if (typeof s !== 'string' || !/[Â-ßâãàá]/.test(s)) return s;
  try {
    const bytes = [];
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      if (cp <= 0xff) bytes.push(cp);
      else if (CP1252_REV[cp] !== undefined) bytes.push(CP1252_REV[cp]);
      else return s; // contains a genuine multibyte char — not mojibake, leave as-is
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
    // Only accept the repair if it produced no replacement chars.
    return decoded.includes('�') ? s : decoded;
  } catch {
    return s;
  }
}

export const sigFull = {
  OM: 'Opening match', CM: 'Closing match', PS: 'Profit symmetry',
  CS: 'Contract size mirroring', DP: 'Duration pattern',
  TOD: 'Time-of-day fingerprint', IR: 'Instrument rotation', LK: 'Linkage signal',
  HEDGE: 'Correlated hedge', CLUSTER: 'Cluster',
};

const pad = (n) => (n < 10 ? '0' + n : '' + n);

// "2026-06-20T13:22:42Z" -> "Jun 20 · 13:22"
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${mon} ${d.getDate()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "2026-06-01T13:45:50Z" -> "13:45:50" (time only)
export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// "35840.0000" / 2480 -> "+$35,840" / "−$2,480" with sign + color
export function fmtMoney(v) {
  const n = Number(v);
  if (isNaN(n)) return { text: '—', color: 'var(--text-2)' };
  const abs = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return {
    text: (n < 0 ? '−$' : '$') + abs,
    color: n < 0 ? 'var(--crit)' : n > 0 ? 'var(--ok)' : 'var(--text-2)',
  };
}

// "1.396" -> "1.4m"
export function fmtDuration(min) {
  const n = Number(min);
  if (isNaN(n)) return '—';
  return n.toFixed(1) + 'm';
}

// "2026-06-20T13:22:42Z" -> "3h ago" / "2d ago"
function fmtAgo(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

// Format a direction value (e.g. "OPPOSITE", "SAME") into a colored chip.
function dirChip(direction) {
  if (!direction) return null;
  const up = String(direction).toUpperCase();
  const isOpp = up.includes('OPP');
  return {
    label: up,
    color: isOpp ? 'var(--high)' : 'var(--info)',
    bg: isOpp ? 'var(--high-soft)' : 'var(--info-soft)',
  };
}

// A flag row from /api/flags/ or /api/overview/ recent list.
// `expanded` map + handlers are injected from React state.
export function decorateFlag(f, { expanded, toggleExpand, openFlag }) {
  const key = sevKey(f.severity);
  const m = sevMeta[key] || sevMeta.medium;
  const users = (f.user_ids || []).join(' · ');
  const sigs = f.signal_codes || [];
  const exp = !!expanded[f.flag_id];
  return {
    id: f.flag_id,
    source: f.source,
    pk: f.id,
    type: f.flag_type,
    instr: (f.instruments || []).join(' / '),
    instruments: f.instruments || [],
    usersText: users,
    userIds: f.user_ids || [],
    numUsers: f.num_users,
    direction: f.direction,
    dirChip: dirChip(f.direction),
    rec: f.recurrence,
    sigText: sigs.join(' · '),
    chips: sigs.map((c) => ({ code: c, full: sigFull[c] || c })),
    sevColor: m.color, sevSoft: m.soft, sevLabel: m.label,
    opened: fmtAgo(f.opened),
    openedFull: fmtDate(f.opened),
    dateText: fmtDate(f.opened),
    updated: fmtAgo(f.updated_at),
    updatedFull: fmtDate(f.updated_at),
    expanded: exp, chevDeg: exp ? '90deg' : '0deg',
    toggleExpand: (e) => { if (e && e.stopPropagation) e.stopPropagation(); toggleExpand(f.flag_id); },
    open: () => openFlag(f),
    // legs are loaded lazily on expand (constituent trades come from detail call)
    legs: null,
  };
}

// Build the account rows for the expanded queue row + investigation, from a
// flag-detail payload (accounts joined with user_ids).
export function detailLegs(detail) {
  const accts = detail.accounts || [];
  const users = detail.user_ids || [];
  const instr = (detail.instruments || []).join(' / ');
  const rows = accts.length ? accts : users.map((u, i) => ({ account_name: '—', trading_platform: '—', _u: u, _i: i }));
  return rows.map((a, i) => {
    const u = users[i] || a._u || '—';
    return {
      user: String(u),
      account: a.account_name || '—',
      platform: a.trading_platform || '—',
      acctId: a.id ?? '—',
      created: fmtDate(a.created_at),
      instr,
    };
  });
}

// Build a real users -> accounts graph from a flag-detail payload, laid out in a
// 320x230 viewBox. The API doesn't say which account belongs to which user, so
// accounts are split positionally across the users (same pairing detailLegs uses)
// and any leftover accounts are distributed round-robin.
export function detailGraph(detail) {
  const users = detail.user_ids || [];
  const accts = detail.accounts || [];
  const W = 320, userY = 56, acctY = 158, r = 20, ar = 13;
  // keep every node + its label fully inside [PAD, W-PAD]
  const PAD = 30;
  if (!users.length) return null;

  // assign each account to a user index
  const buckets = users.map(() => []);
  accts.forEach((a, i) => { buckets[i < users.length ? i : i % users.length].push(a); });

  const clampX = (x) => Math.max(PAD, Math.min(W - PAD, x));

  // user node x positions, evenly spread within the padded width
  const ux = (i) => users.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (users.length - 1);

  const userNodes = users.map((u, i) => ({ id: 'u' + i, label: String(u), x: ux(i), y: userY }));

  // account node x positions: spread within each user's column, clamped to bounds
  const acctNodes = [];
  const edges = [];
  users.forEach((_, i) => {
    const bucket = buckets[i];
    const cx = ux(i);
    const span = Math.min(86, 40 * Math.max(1, bucket.length - 1));
    bucket.forEach((a, j) => {
      const raw = bucket.length === 1 ? cx : cx - span / 2 + (j * span) / (bucket.length - 1);
      const x = clampX(raw);
      const id = 'a' + i + '_' + j;
      acctNodes.push({ id, label: a.account_name || '—', sub: a.trading_platform || '', x, y: acctY });
      edges.push({ x1: cx, y1: userY + r, x2: x, y2: acctY - ar });
    });
  });

  // edge between the two primary users (the flagged pair), if exactly a pair
  const pairEdge = users.length === 2
    ? { x1: ux(0) + r, y1: userY, x2: ux(1) - r, y2: userY }
    : null;

  return { W, H: 200, r, ar, userNodes, acctNodes, edges, pairEdge };
}

// Map a detail payload's signals onto investigation checklist rows. Surfaces the
// raw signal_data key/value pairs so nothing from the API is dropped.
export function detailSignals(detail) {
  const present = detail.signals || [];
  const order = ['OM','CM','PS','CS','DP','TOD','HEDGE','CLUSTER','IR','LK'];
  const byCode = {};
  present.forEach((s) => { byCode[s.signal_code] = s; });
  const codes = order.filter((c) => byCode[c]).concat(
    present.map((s) => s.signal_code).filter((c) => !order.includes(c))
  );
  return codes.map((code, i) => {
    const s = byCode[code] || {};
    const data = s.signal_data || {};
    const pairs = Object.entries(data).map(([k, v]) => ({ k, v: typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v) }));
    return {
      n: String(i + 1),
      code,
      signalId: s.id,
      name: s.signal_name || sigFull[code] || code,
      created: fmtDate(s.created_at),
      pairs,                                  // raw signal_data, fully shown
      note: pairs.map((p) => `${p.k}: ${p.v}`).join(' · '),
      value: code,
      mark: '✓', dot: 'var(--ok)', valColor: 'var(--text)',
    };
  });
}

// Decorate the full /api/overview/ payload into render-ready structures, mapping
// EVERY field the endpoint returns (structured kpis, matrix, rollups, etc.).
export function decorateOverview(ov) {
  if (!ov) return null;
  const k = ov.kpis || {};
  const fmtMaybe = (v) => (v === null || v === undefined ? '—' : v.toLocaleString());

  // KPI cards driven by the structured kpis object (value + note + extras).
  const kpiCards = [
    {
      label: 'Open flags',
      value: fmtMaybe(k.open_flags?.value),
      sub: k.open_flags?.delta_vs_yesterday != null
        ? `Δ ${k.open_flags.delta_vs_yesterday} vs. yesterday`
        : '',
      note: k.open_flags?.note,
      available: k.open_flags?.available,
    },
    {
      label: 'Critical',
      value: fmtMaybe(k.critical_unassigned?.value),
      color: 'var(--crit)',
      sub: k.critical_unassigned?.breaching_sla_lt_1h != null
        ? `${k.critical_unassigned.breaching_sla_lt_1h} breaching SLA < 1h`
        : '',
      note: k.critical_unassigned?.note,
      available: k.critical_unassigned?.available,
    },
    {
      label: 'Avg review time',
      value: k.avg_review_time_hours?.value != null ? k.avg_review_time_hours.value + 'h' : '—',
      sub: k.avg_review_time_hours?.sla_target_hours != null
        ? `SLA target ${k.avg_review_time_hours.sla_target_hours}h`
        : '',
      note: k.avg_review_time_hours?.note,
      available: k.avg_review_time_hours?.available,
    },
    {
      label: 'Accounts in scope',
      value: fmtMaybe(k.accounts_in_scope?.value),
      sub: (k.accounts_in_scope?.evaluation != null || k.accounts_in_scope?.qualified != null)
        ? `Eval ${k.accounts_in_scope.evaluation ?? '—'} · Qual ${k.accounts_in_scope.qualified ?? '—'}`
        : 'appearing in flags',
      note: k.accounts_in_scope?.note,
      available: k.accounts_in_scope?.available,
    },
    {
      label: 'Suppressed · 24h',
      value: fmtMaybe(k.suppressed_24h?.value),
      sub: k.suppressed_24h?.configured_total != null
        ? `${k.suppressed_24h.configured_total} configured total`
        : '',
      note: k.suppressed_24h?.note,
      available: k.suppressed_24h?.available,
    },
  ];

  // by_flag_type rollup (code/label/source/count), labels de-mojibaked.
  const byType = (ov.by_flag_type || []).map((t) => ({
    code: t.code,
    label: fixMojibake(t.label),
    source: t.source,
    count: t.count,
    color: t.code.startsWith('RT') ? 'var(--crit)' : 'var(--high)',
  }));

  // signal_severity_matrix, with the UPGRADE_* results rendered distinctly.
  const matrix = (ov.signal_severity_matrix || []).map((r) => {
    const result = r.result;
    const isUpgrade = String(result).startsWith('UPGRADE');
    const sm = sevMeta[sevKey(result)];
    return {
      signals: fixMojibake(r.signals),
      recurrence: fixMojibake(r.recurrence),
      result,
      isUpgrade,
      badge: isUpgrade ? null : (sm ? { t: sm.label, c: sm.color, s: sm.soft } : { t: result, c: 'var(--text-2)', s: 'var(--inset)' }),
      upgradeLabel: isUpgrade ? '▲ upgrade ' + (result.match(/\d+/)?.[0] || '1') + ' level' : null,
    };
  });

  // suppression_filters (name/active/count_24h/detail).
  const suppression = (ov.suppression_filters || []).map((f) => ({
    name: fixMojibake(f.name),
    active: !!f.active,
    count24h: f.count_24h,
    detail: fixMojibake(f.detail),
  }));

  // signals_by_code: { OM: 560, ... } -> sorted list
  const signalsByCode = Object.entries(ov.signals_by_code || {})
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, full: sigFull[code] || code, count }));

  // accounts_by_platform: { "Alpha Trader": 1120 } -> list
  const accountsByPlatform = Object.entries(ov.accounts_by_platform || {})
    .map(([platform, count]) => ({ platform, count }));

  return {
    kpiCards,
    bySeverity: ov.by_severity || {},
    byType,
    bySource: ov.by_source || {},
    matrix,
    suppression,
    signalsByCode,
    accountsByPlatform,
    totals: ov.totals || {},
  };
}

export const typeHeadings = {
  'RT-1': 'Behaviour-based reverse trading — two unique users, opposite sides, same instrument.',
  'RT-2': 'Same account holding opposing positions in correlated instruments above a 0.50 hedge ratio.',
  'GT-1': 'Multiple users entering the same instrument in the same direction within 5 minutes.',
  'GT-2': 'Multiple users deliberately taking opposite sides of the same instrument within 5 minutes.',
};

// ---- Overview derived bits from /api/overview/ ----

// Build the trend bars from the live 14-day series (flags_raised_14d), scaled to
// a 138px max. Falls back to a derived view from the severity mix if the series
// is absent.
export function overviewTrendBars(overview) {
  const series = overview && Array.isArray(overview.flags_raised_14d) ? overview.flags_raised_14d : null;
  if (series && series.length) {
    const totals = series.map((d) => (d.critical || 0) + (d.high || 0) + (d.medium || 0));
    const max = Math.max(1, ...totals);
    const scale = 138 / max;
    return series.map((d) => {
      const c = d.critical || 0, h = d.high || 0, m = d.medium || 0;
      // "2026-06-20" -> "Jun 20" for the first/last, day-of-month otherwise
      const dt = new Date(d.date);
      const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()];
      return {
        label: String(dt.getDate()),
        labelFull: `${mon} ${dt.getDate()}`,
        cH: Math.round(c * scale), hH: Math.round(h * scale), mH: Math.round(m * scale),
        title: `${mon} ${dt.getDate()} — ${c + h + m} flags`,
      };
    });
  }
  // fallback (no series)
  const bs = (overview && overview.by_severity) || {};
  const crit = bs.CRITICAL || 0, high = bs.HIGH || 0, med = bs.MEDIUM || 0;
  const total = Math.max(1, crit + high + med);
  return Array.from({ length: 14 }, (_, i) => {
    const f = 0.4 + (i / 13) * 0.6;
    return {
      label: String(i + 1),
      cH: Math.round((crit / total) * 138 * f),
      hH: Math.round((high / total) * 138 * f),
      mH: Math.round((med / total) * 138 * f),
      title: `~${Math.round((total * f) / 13)} flags`,
    };
  });
}

// ---- Run History (no API) : static/derived, unchanged from the mock ----

export function historyVals(histSel) {
  const today = 18;
  const sel = histSel || today;
  const special = { 6:'partial', 11:'failed' };
  const flagsByDay = { 1:18,2:22,3:15,4:27,5:19,6:31,7:12,8:24,9:29,10:17,11:0,12:33,13:21,14:26,15:23,16:30,17:28,18:34 };
  const meta = {
    success:   { label:'Success',   color:'var(--ok)',     soft:'var(--ok-soft)' },
    partial:   { label:'Partial',   color:'var(--high)',   soft:'var(--high-soft)' },
    failed:    { label:'Failed',    color:'var(--crit)',   soft:'var(--crit-soft)' },
    scheduled: { label:'Scheduled', color:'var(--text-3)', soft:'var(--inset)' },
  };
  const statusOf = (d) => (d > today ? 'scheduled' : (special[d] || 'success'));
  return { today, sel, special, flagsByDay, meta, statusOf };
}
