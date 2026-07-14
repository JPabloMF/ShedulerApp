import { useEffect, useState, type CSSProperties } from 'react';

type Severity = 'low' | 'medium' | 'high';
type RepeatUnit = 'week' | 'month' | 'year';
type TimeFilter = 'all' | 'soon' | 'medium' | 'far';
type Tab = 'active' | 'history';

interface Errand {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  severity: Severity;
  notes: string;
  recurring: boolean;
  repeatN: number;
  repeatUnit: RepeatUnit;
}

interface HistoryEntry {
  id: string;
  name: string;
  date: string;
  severity: Severity;
  notes: string;
  recurring: boolean;
  completedOn: string;
}

interface ErrandForm {
  id: string | null;
  name: string;
  date: string;
  severity: Severity;
  notes: string;
  recurring: boolean;
  repeatN: number;
  repeatUnit: RepeatUnit;
}

interface Store {
  errands: Errand[];
  history: HistoryEntry[];
}

const STORAGE_KEY = 'errands_v2';

// ---- date helpers ----
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function todayStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return iso(d);
}
function addDays(str: string, n: number) {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
}
function addMonths(str: string, n: number) {
  const d = new Date(str + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return iso(d);
}
function addUnit(str: string, n: number, unit: RepeatUnit) {
  return unit === 'week' ? addDays(str, n * 7) : unit === 'year' ? addMonths(str, n * 12) : addMonths(str, n);
}
function daysUntil(str: string) {
  const d = new Date(str + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}
function fmtDate(str: string) {
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function recurLabel(n: number, unit: RepeatUnit) {
  const abbr = { week: 'WK', month: 'MO', year: 'YR' }[unit] || 'MO';
  const single = { week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[unit] || 'MONTHLY';
  return n > 1 ? `↻ EVERY ${n} ${abbr}` : `↻ ${single}`;
}
function recurPhrase(n: number, unit: RepeatUnit) {
  return n > 1 ? `${n} ${unit}s` : unit;
}
function countdownText(days: number) {
  if (days < 0) return Math.abs(days) + 'd overdue';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 14) return 'in ' + days + ' days';
  if (days < 60) return 'in ' + Math.round(days / 7) + ' wk';
  return 'in ' + Math.round(days / 30) + ' mo';
}

function sevLabel(s: Severity) {
  return s === 'high' ? 'High' : s === 'low' ? 'Low' : 'Medium';
}
function sevStyle(s: Severity): CSSProperties {
  const base: CSSProperties = {
    fontSize: '9.5px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderRadius: '4px',
    padding: '2px 6px',
    border: '1px solid',
  };
  if (s === 'high') return { ...base, color: '#f0a49d', background: 'rgba(150,60,55,0.24)', borderColor: 'rgba(200,90,85,0.4)' };
  if (s === 'low') return { ...base, color: '#9aa1ac', background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.13)' };
  return { ...base, color: '#e6c778', background: 'rgba(160,120,40,0.22)', borderColor: 'rgba(200,160,70,0.36)' };
}

// ---- color scale (green far -> red near), dark theme ----
function hueFor(days: number, span: number) {
  const t = Math.max(0, Math.min(span, days)) / span;
  return 8 + t * (142 - 8);
}
const accentFor = (days: number, span: number) => `hsl(${Math.round(hueFor(days, span))} 62% 56%)`; // border + bar (vivid)
const cardBgFor = (days: number, span: number) => `hsl(${Math.round(hueFor(days, span))} 34% 12%)`; // lighter tinted fill
const chipBgFor = (days: number, span: number) => `hsl(${Math.round(hueFor(days, span))} 38% 20%)`;
const chipTextFor = (days: number, span: number) => `hsl(${Math.round(hueFor(days, span))} 72% 76%)`;

const MONO = "'IBM Plex Mono', monospace";

function normalize(e: Errand): Errand {
  return e.recurring ? { ...e, repeatN: e.repeatN || 1, repeatUnit: e.repeatUnit || 'month' } : e;
}

function loadStore(): Store {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (data && Array.isArray(data.errands)) {
      return { errands: data.errands.map(normalize), history: data.history || [] };
    }
  } catch {
    /* corrupted storage falls through to empty */
  }
  return { errands: [], history: [] };
}

interface AppProps {
  colorSpanDays?: number;
  showNotes?: boolean;
}

export default function App({ colorSpanDays = 45, showNotes = true }: AppProps) {
  const [store, setStore] = useState<Store>(loadStore);
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [form, setForm] = useState<ErrandForm | null>(null);

  const { errands, history } = store;
  const span = colorSpanDays;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* storage unavailable */
    }
  }, [store]);

  // urgency buckets, relative to the color-scale span
  function timeBucket(days: number): TimeFilter {
    if (days <= Math.round(span / 5)) return 'soon'; // overdue → ~1/5 of span (red/orange)
    if (days <= Math.round(span / 2)) return 'medium'; // up to half the span (yellow)
    return 'far'; // beyond that (green)
  }
  function matches(name: string, notes: string, days: number | null) {
    const q = search.trim().toLowerCase();
    const okQ = !q || (name + ' ' + (notes || '')).toLowerCase().includes(q);
    const okT = timeFilter === 'all' || (days === null ? true : timeBucket(days) === timeFilter);
    return okQ && okT;
  }

  const setField = <K extends keyof ErrandForm>(k: K, v: ErrandForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const openNew = () =>
    setForm({ id: null, name: '', date: addDays(todayStr(), 7), severity: 'medium', notes: '', recurring: false, repeatN: 1, repeatUnit: 'month' });
  const openEdit = (id: string) => {
    const e = errands.find((x) => x.id === id);
    if (e) setForm({ ...e });
  };
  const closeForm = () => setForm(null);

  const saveForm = () => {
    if (!form || !form.name.trim() || !form.date) return;
    const fields = {
      name: form.name.trim(),
      date: form.date,
      severity: form.severity,
      notes: form.notes,
      recurring: form.recurring,
      repeatN: form.repeatN || 1,
      repeatUnit: form.repeatUnit || 'month',
    };
    const id = form.id;
    setStore((s) => ({
      ...s,
      errands: id
        ? s.errands.map((x) => (x.id === id ? { ...x, ...fields } : x))
        : [...s.errands, { id: uid(), ...fields }],
    }));
    setForm(null);
  };
  const deleteFromForm = () => {
    const id = form?.id;
    if (!id) return;
    setStore((s) => ({ ...s, errands: s.errands.filter((x) => x.id !== id) }));
    setForm(null);
  };

  const markDone = (id: string) => {
    setStore((s) => {
      const e = s.errands.find((x) => x.id === id);
      if (!e) return s;
      const entry: HistoryEntry = {
        id: uid(),
        name: e.name,
        date: e.date,
        severity: e.severity,
        notes: e.notes,
        recurring: e.recurring,
        completedOn: todayStr(),
      };
      let errandsNext: Errand[];
      if (e.recurring) {
        const n = e.repeatN || 1;
        const unit = e.repeatUnit || 'month';
        let nd = addUnit(e.date, n, unit);
        while (daysUntil(nd) < 0) nd = addUnit(nd, n, unit);
        errandsNext = s.errands.map((x) => (x.id === id ? { ...x, date: nd } : x));
      } else {
        errandsNext = s.errands.filter((x) => x.id !== id);
      }
      return { errands: errandsNext, history: [entry, ...s.history] };
    });
  };

  const restore = (entryId: string) => {
    setStore((s) => {
      const en = s.history.find((x) => x.id === entryId);
      if (!en) return s;
      return {
        errands: [
          ...s.errands,
          { id: uid(), name: en.name, date: en.date, severity: en.severity, notes: en.notes, recurring: en.recurring, repeatN: 1, repeatUnit: 'month' },
        ],
        history: s.history.filter((x) => x.id !== entryId),
      };
    });
  };
  const clearHistory = (entryId: string) =>
    setStore((s) => ({ ...s, history: s.history.filter((x) => x.id !== entryId) }));

  // ---- derived views ----
  const activeItems = errands
    .map((e) => ({ e, days: daysUntil(e.date) }))
    .filter(({ e, days }) => matches(e.name, e.notes, days))
    .sort((a, b) => a.days - b.days);

  const historyItems = history
    .filter((h) => matches(h.name, h.notes, null))
    .slice()
    .sort((a, b) => (a.completedOn < b.completedOn ? 1 : -1));

  const canSave = !!(form && form.name.trim() && form.date);

  const tabBtn = (on: boolean): CSSProperties => ({
    padding: '4px 2px 14px',
    fontSize: '15px',
    fontWeight: 600,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: on ? '#eef1f5' : '#7a828f',
    borderBottom: '2px solid ' + (on ? '#e7eaef' : 'transparent'),
    marginBottom: '-1px',
  });
  const sevBtn = (val: Severity): CSSProperties => {
    const on = form?.severity === val;
    return {
      flex: 1,
      padding: '11px 0',
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
      borderRadius: '9px',
      border: '1px solid ' + (on ? '#e7eaef' : '#2a323d'),
      background: on ? '#e7eaef' : '#0e1116',
      color: on ? '#0e1116' : '#98a0ac',
    };
  };
  const unitBtn = (u: RepeatUnit): CSSProperties => {
    const on = form?.repeatUnit === u;
    return {
      flex: 1,
      padding: '9px 0',
      fontSize: '12.5px',
      fontWeight: 600,
      cursor: 'pointer',
      borderRadius: '8px',
      border: '1px solid ' + (on ? '#e7eaef' : '#2a323d'),
      background: on ? '#e7eaef' : '#0e1116',
      color: on ? '#0e1116' : '#98a0ac',
    };
  };
  const chipStyleFor = (key: TimeFilter): CSSProperties => {
    const on = timeFilter === key;
    return {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      fontSize: '12.5px',
      fontWeight: 500,
      cursor: 'pointer',
      padding: '7px 14px',
      borderRadius: '20px',
      border: '1px solid ' + (on ? '#e7eaef' : '#2a323d'),
      background: on ? '#e7eaef' : '#171c23',
      color: on ? '#0e1116' : '#98a0ac',
    };
  };

  const filterChips: { key: TimeFilter; label: string; dot: string | null }[] = [
    { key: 'all', label: 'All', dot: null },
    { key: 'soon', label: 'Soon', dot: accentFor(0, span) },
    { key: 'medium', label: 'Upcoming', dot: accentFor(Math.round(span / 2.5), span) },
    { key: 'far', label: 'Far off', dot: accentFor(span, span) },
  ];

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#7a828f',
    marginBottom: '7px',
  };

  const emptyHint = search || timeFilter !== 'all' ? 'try clearing the search or filter' : 'tap + to add one';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0e1116' }}>
      <div style={{ width: '100%', maxWidth: '480px', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(16,20,26,0.92)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #232a34',
            padding: '14px 16px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>Errands</span>
            <span style={{ fontFamily: MONO, fontSize: '11px', color: '#7a828f' }}>{errands.length} scheduled</span>
          </div>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#656d7a', fontSize: '15px' }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search errands…"
              style={{ width: '100%', padding: '11px 12px 11px 32px', fontSize: '14px', border: '1px solid #2a323d', borderRadius: '10px', background: '#171c23' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <button onClick={() => setTab('active')} style={tabBtn(tab === 'active')}>
              Active <span style={{ fontFamily: MONO, fontSize: '11px', opacity: 0.6 }}>{errands.length}</span>
            </button>
            <button onClick={() => setTab('history')} style={tabBtn(tab === 'history')}>
              History <span style={{ fontFamily: MONO, fontSize: '11px', opacity: 0.6 }}>{history.length}</span>
            </button>
          </div>
        </header>

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '12px 16px', WebkitOverflowScrolling: 'touch' }}>
          {filterChips.map((c) => (
            <button key={c.key} onClick={() => setTimeFilter(c.key)} style={chipStyleFor(c.key)}>
              {c.dot && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />}
              {c.label}
            </button>
          ))}
        </div>

        <main style={{ flex: 1, padding: '0 16px 110px' }}>
          {tab === 'active' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeItems.map(({ e, days }) => {
                const accent = accentFor(days, span);
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '14px',
                      background: cardBgFor(days, span),
                      border: '1px solid ' + accent,
                      borderLeft: '5px solid ' + accent,
                      borderRadius: '13px',
                    }}
                  >
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        markDone(e.id);
                      }}
                      title="Mark done"
                      style={{
                        width: '24px',
                        height: '24px',
                        flexShrink: 0,
                        marginTop: '1px',
                        borderRadius: '50%',
                        border: '2px solid ' + accent,
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                    <div onClick={() => openEdit(e.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em', color: '#eef1f5' }}>{e.name}</span>
                        <span style={sevStyle(e.severity)}>{sevLabel(e.severity)}</span>
                        {e.recurring && (
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: '9.5px',
                              fontWeight: 500,
                              color: '#8a919c',
                              background: 'rgba(255,255,255,0.06)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              letterSpacing: '0.03em',
                            }}
                          >
                            {recurLabel(e.repeatN || 1, e.repeatUnit || 'month')}
                          </span>
                        )}
                      </div>
                      {showNotes && !!e.notes.trim() && (
                        <div style={{ fontSize: '13px', color: '#98a0ac', marginTop: '3px', lineHeight: 1.4 }}>{e.notes}</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: '11.5px',
                            fontWeight: 600,
                            color: chipTextFor(days, span),
                            background: chipBgFor(days, span),
                            borderRadius: '6px',
                            padding: '3px 8px',
                          }}
                        >
                          {countdownText(days)}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: '11.5px', color: '#7a828f' }}>{fmtDate(e.date)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {activeItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '64px 20px', color: '#656d7a' }}>
                  <div style={{ fontSize: '14px', marginBottom: '4px', color: '#8a919c' }}>No errands here.</div>
                  <div style={{ fontFamily: MONO, fontSize: '12px' }}>{emptyHint}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {historyItems.map((h) => (
                <div
                  key={h.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', background: '#151a21', border: '1px solid #232a34', borderRadius: '12px' }}
                >
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#2a323d', color: '#8a919c', display: 'grid', placeItems: 'center', fontSize: '12px', flexShrink: 0 }}>
                    ✓
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#8a919c', textDecoration: 'line-through', textDecorationColor: '#414954' }}>{h.name}</span>
                      <span style={sevStyle(h.severity)}>{sevLabel(h.severity)}</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: '11px', color: '#656d7a', marginTop: '4px' }}>done {fmtDate(h.completedOn)}</div>
                  </div>
                  {!h.recurring && (
                    <button
                      onClick={() => restore(h.id)}
                      style={{ fontSize: '12px', color: '#7fb0f0', background: 'transparent', border: '1px solid #34435a', borderRadius: '7px', padding: '7px 11px', cursor: 'pointer' }}
                    >
                      Restore
                    </button>
                  )}
                  <button
                    onClick={() => clearHistory(h.id)}
                    title="Remove"
                    style={{
                      width: '32px',
                      height: '32px',
                      display: 'grid',
                      placeItems: 'center',
                      border: 'none',
                      borderRadius: '7px',
                      background: 'transparent',
                      color: '#656d7a',
                      cursor: 'pointer',
                      fontSize: '17px',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {historyItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '64px 20px', color: '#656d7a', fontSize: '14px' }}>No completed errands yet.</div>
              )}
            </div>
          )}
        </main>

        <button
          onClick={openNew}
          title="New errand"
          style={{
            position: 'fixed',
            bottom: '22px',
            right: 'max(16px, calc(50% - 240px + 16px))',
            zIndex: 30,
            width: '56px',
            height: '56px',
            borderRadius: '18px',
            background: '#e7eaef',
            color: '#0e1116',
            border: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: '28px',
            fontWeight: 400,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          +
        </button>

        {form && (
          <div
            onClick={closeForm}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(6,8,11,0.6)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              animation: 'fadeIn 0.15s ease',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '480px',
                background: '#151a21',
                borderTop: '1px solid #2a323d',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
                animation: 'sheetUp 0.24s cubic-bezier(0.2,0.8,0.2,1)',
                maxHeight: '92vh',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
                <div style={{ width: '38px', height: '4px', borderRadius: '2px', background: '#333c48' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px 14px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700 }}>{form.id ? 'Edit errand' : 'New errand'}</span>
                <button onClick={closeForm} style={{ width: '32px', height: '32px', border: 'none', background: 'transparent', color: '#7a828f', fontSize: '20px', cursor: 'pointer' }}>
                  ×
                </button>
              </div>
              <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Errand name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    placeholder="e.g. Pay rent"
                    style={{ width: '100%', padding: '12px 13px', fontSize: '15px', border: '1px solid #2a323d', borderRadius: '10px', background: '#0e1116' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Due date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setField('date', e.target.value)}
                    style={{ width: '100%', padding: '11px 13px', fontSize: '15px', fontFamily: MONO, border: '1px solid #2a323d', borderRadius: '10px', background: '#0e1116' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Severity</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setField('severity', 'low')} style={sevBtn('low')}>Low</button>
                    <button onClick={() => setField('severity', 'medium')} style={sevBtn('medium')}>Medium</button>
                    <button onClick={() => setField('severity', 'high')} style={sevBtn('high')}>High</button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    placeholder="Optional details…"
                    rows={3}
                    style={{ width: '100%', padding: '11px 13px', fontSize: '14px', border: '1px solid #2a323d', borderRadius: '10px', background: '#0e1116', resize: 'vertical', lineHeight: 1.5 }}
                  />
                </div>
                <div>
                  <button
                    onClick={() => setField('recurring', !form.recurring)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '11px',
                      width: '100%',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#cfd4db',
                      background: '#0e1116',
                      border: '1px solid #2a323d',
                      borderRadius: '10px',
                      padding: '12px 13px',
                      cursor: 'pointer',
                      lineHeight: 1.35,
                    }}
                  >
                    <span
                      style={{
                        width: '20px',
                        height: '20px',
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: '#0e1116',
                        border: '1px solid ' + (form.recurring ? '#e7eaef' : '#3a434f'),
                        background: form.recurring ? '#e7eaef' : 'transparent',
                      }}
                    >
                      {form.recurring ? '✓' : ''}
                    </span>
                    <span style={{ textAlign: 'left' }}>
                      Repeating errand
                      <br />
                      <span style={{ color: '#7a828f', fontWeight: 400, fontSize: '12px' }}>
                        {form.recurring
                          ? 'reschedules every ' + recurPhrase(form.repeatN || 1, form.repeatUnit || 'month') + ' when marked done'
                          : 'one-time errand'}
                      </span>
                    </span>
                  </button>
                  {form.recurring && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#98a0ac', flexShrink: 0 }}>Every</span>
                      <input
                        type="number"
                        min={1}
                        value={form.repeatN}
                        onChange={(e) => setField('repeatN', Math.max(1, parseInt(e.target.value, 10) || 1))}
                        style={{
                          width: '56px',
                          padding: '9px 8px',
                          fontSize: '14px',
                          fontFamily: MONO,
                          textAlign: 'center',
                          border: '1px solid #2a323d',
                          borderRadius: '9px',
                          background: '#0e1116',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                        <button onClick={() => setField('repeatUnit', 'week')} style={unitBtn('week')}>Weeks</button>
                        <button onClick={() => setField('repeatUnit', 'month')} style={unitBtn('month')}>Months</button>
                        <button onClick={() => setField('repeatUnit', 'year')} style={unitBtn('year')}>Years</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '18px',
                  marginTop: '16px',
                  borderTop: '1px solid #232a34',
                  background: '#12161c',
                  position: 'sticky',
                  bottom: 0,
                }}
              >
                {form.id && (
                  <button
                    onClick={deleteFromForm}
                    style={{ fontSize: '14px', color: '#ef8f87', background: 'transparent', border: '1px solid #4a2f2c', borderRadius: '9px', padding: '12px 14px', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={saveForm}
                  style={{
                    flex: 1,
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#0e1116',
                    background: canSave ? '#e7eaef' : '#3a434f',
                    border: 'none',
                    borderRadius: '9px',
                    padding: '13px',
                    cursor: canSave ? 'pointer' : 'not-allowed',
                  }}
                >
                  Save errand
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
