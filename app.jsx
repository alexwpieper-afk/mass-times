  const { useState, useMemo } = React;

  /* ---------- helpers ---------- */
  const priestById = id => window.PRIESTS.find(p => p.id === id);
  const churchById = id => window.CHURCHES.find(c => c.id === id);

  function fmtTime(t) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h < 12 ? "AM" : "PM";
    let hr = h % 12; if (hr === 0) hr = 12;
    return { hr: String(hr), min: m === 0 ? "00" : String(m).padStart(2, "0"), ampm };
  }
  function partOfDay(t) {
    const h = Number(t.split(":")[0]);
    if (h < 12) return "Morning";
    if (h < 17) return "Afternoon";
    return "Evening";
  }
  const PERIODS = ["Morning", "Afternoon", "Evening"];

  // Rolling window: today + the next 6 days. St. Columbkille masses are keyed by
  // ISO date (from its bulletins); the other parishes are recurring weekday
  // patterns we expand onto each date. As new bulletins publish, presider
  // coverage extends forward and the window keeps showing 7 upcoming days.
  const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WINDOW_LEN = 7;
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const WINDOW = (() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return Array.from({ length: WINDOW_LEN }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      return {
        iso: isoOf(d), weekday: d.getDay(), dayNum: d.getDate(),
        longName: WEEKDAY_LONG[d.getDay()], shortName: WEEKDAY_SHORT[d.getDay()],
        monthShort: MONTH_SHORT[d.getMonth()], isToday: i === 0,
      };
    });
  })();
  function massesForDate(w) {
    const dated = window.DATED_MASSES.filter(m => m.date === w.iso);
    const weekly = window.WEEKLY_MASSES.filter(m => m.day === w.weekday);
    return dated.concat(weekly);
  }

  /* ---------- small UI bits ---------- */
  function Initials({ priest, size = 36 }) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: "var(--gold-tint)", color: "var(--gold-deep)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 700, letterSpacing: "0.02em",
        flexShrink: 0, fontFamily: "var(--font-ui)",
      }}>{priest.initials}</div>
    );
  }

  function Chevron() {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  function LiveDot() {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
        color: "var(--gold-deep)",
      }}>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><circle cx="4.5" cy="4.5" r="3.2" fill="#C0392B" /></svg>
        Live
      </span>
    );
  }

  /* ---------- filter pill (opens sheet) ---------- */
  function FilterPill({ label, value, active, onClick }) {
    return (
      <button onClick={onClick} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "9px 13px", borderRadius: 999,
        background: active ? "var(--ink)" : "var(--surface)",
        color: active ? "#fff" : "var(--ink)",
        border: active ? "1px solid var(--ink)" : "1px solid var(--line)",
        fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
        transition: "all .15s ease", boxShadow: active ? "none" : "0 1px 1px rgba(43,40,37,0.03)",
      }}>
        <span style={{ opacity: active ? 0.62 : 0.5, fontWeight: 500 }}>{label}</span>
        <span>{value}</span>
        <span style={{ opacity: active ? 0.7 : 0.4 }}><Chevron /></span>
      </button>
    );
  }

  /* ---------- day selector ---------- */
  function DayBar({ value, onChange }) {
    return (
      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "2px 18px 2px", scrollPaddingLeft: 18 }}>
        <DayChip label="Next 7 days" selected={value === "all"} onClick={() => onChange("all")} />
        {WINDOW.map(w => (
          <DayChip key={w.iso}
            label={w.shortName}
            sub={w.isToday ? "Today" : String(w.dayNum)}
            selected={value === w.iso}
            onClick={() => onChange(w.iso)} />
        ))}
      </div>
    );
  }
  function DayChip({ label, sub, selected, onClick }) {
    return (
      <button onClick={onClick} style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minWidth: sub ? 54 : 48, padding: "8px 12px", borderRadius: 13,
        background: selected ? "var(--gold)" : "var(--surface)",
        color: selected ? "#fff" : "var(--ink-soft)",
        border: selected ? "1px solid var(--gold)" : "1px solid var(--line)",
        fontSize: 14, fontWeight: 600, lineHeight: 1.1, flexShrink: 0,
        transition: "all .15s ease",
      }}>
        <span>{label}</span>
        {sub && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2, opacity: selected ? 0.85 : 0.55 }}>{sub}</span>}
      </button>
    );
  }

  /* ---------- mass row ---------- */
  function MassRow({ mass }) {
    const church = churchById(mass.church);
    const priest = mass.presider ? priestById(mass.presider) : null;
    const t = fmtTime(mass.time);
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 13,
        padding: "13px 15px", background: "var(--surface)",
      }}>
        {/* time */}
        <div style={{ width: 56, flexShrink: 0, textAlign: "right" }}>
          <div className="tnum" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.01em" }}>
            {t.hr}<span style={{ fontWeight: 600 }}>:{t.min}</span>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gold-deep)", letterSpacing: "0.07em", marginTop: 3 }}>{t.ampm}</div>
        </div>

        {/* church-colored divider */}
        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: church.color, opacity: 0.6, flexShrink: 0 }} />

        {/* details — church name + (presider · type) stacked */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, lineHeight: 1.18, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {church.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mass.type}{priest ? ` · ${priest.name}` : ""}
            </span>
            {mass.livestream && <LiveDot />}
          </div>
        </div>

        {/* priest avatar (only where the presider is published) */}
        {priest && <Initials priest={priest} size={36} />}
      </div>
    );
  }

  /* ---------- a day's masses, as a card ---------- */
  function MassCard({ masses }) {
    return (
      <div style={{ borderRadius: "var(--r-md)", overflow: "hidden", boxShadow: "var(--shadow)", border: "1px solid var(--line-soft)" }}>
        {masses.map((m, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ height: 1, background: "var(--line-soft)", marginLeft: 16 }} />}
            <MassRow mass={m} />
          </React.Fragment>
        ))}
      </div>
    );
  }

  /* ---------- one day in the rolling window ---------- */
  function DaySection({ w, masses }) {
    return (
      <section style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 10px" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)", letterSpacing: "0.01em" }}>
            {w.longName}
            <span style={{ marginLeft: 7, fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: 600, color: "var(--ink-faint)" }}>{w.monthShort} {w.dayNum}</span>
            {w.isToday && <span style={{ marginLeft: 8, fontFamily: "var(--font-ui)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: "var(--gold)", padding: "2px 7px", borderRadius: 99, verticalAlign: "middle" }}>Today</span>}
          </h2>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-faint)" }}>{masses.length}</span>
        </div>
        <MassCard masses={masses} />
      </section>
    );
  }

  /* ---------- bottom sheet ---------- */
  function Sheet({ open, title, onClose, children }) {
    if (!open) return null;
    return (
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(35,32,28,0.42)", animation: "scrimIn .2s ease both" }} />
        <div onClick={e => e.stopPropagation()} style={{
          position: "relative", background: "var(--surface)", borderTopLeftRadius: 26, borderTopRightRadius: 26,
          boxShadow: "var(--shadow-sheet)", maxWidth: 460, margin: "0 auto", width: "100%",
          maxHeight: "76vh", display: "flex", flexDirection: "column", animation: "sheetIn .28s cubic-bezier(.2,.8,.2,1) both",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
            <div style={{ width: 38, height: 4.5, borderRadius: 99, background: "var(--line)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 12px" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600 }}>{title}</h3>
            <button onClick={onClose} style={{ fontSize: 14, fontWeight: 600, color: "var(--gold-deep)", padding: "4px 8px" }}>Done</button>
          </div>
          <div style={{ overflowY: "auto", padding: "0 12px 8px" }}>{children}</div>
        </div>
      </div>
    );
  }

  function OptionRow({ label, sub, dot, selected, onClick }) {
    return (
      <button onClick={onClick} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        padding: "13px 14px", borderRadius: 13, background: selected ? "var(--surface-2)" : "transparent",
        border: selected ? "1px solid var(--line)" : "1px solid transparent",
      }}>
        {dot !== undefined && (
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: dot || "var(--ink-faint)", flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
          {sub && <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-soft)", marginTop: 1 }}>{sub}</span>}
        </span>
        <span style={{
          width: 21, height: 21, borderRadius: "50%", flexShrink: 0,
          border: selected ? "none" : "1.5px solid var(--line)",
          background: selected ? "var(--gold)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {selected && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </span>
      </button>
    );
  }

  /* ---------- empty state ---------- */
  function Empty({ onClear }) {
    return (
      <div style={{ textAlign: "center", padding: "60px 30px", animation: "fadeUp .3s ease both" }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✦</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, marginBottom: 6 }}>No masses match</div>
        <div style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 20, lineHeight: 1.5 }}>Try a different church, priest, time, or day.</div>
        <button onClick={onClear} style={{ padding: "10px 18px", borderRadius: 999, background: "var(--ink)", color: "#fff", fontSize: 14, fontWeight: 600 }}>Clear filters</button>
      </div>
    );
  }

  /* ---------- main app ---------- */
  function App() {
    const [church, setChurch] = useState("all");
    const [priest, setPriest] = useState("all");
    const [period, setPeriod] = useState("all"); // Morning | Afternoon | Evening | all
    const [day, setDay]       = useState("all");  // "all" or an ISO date in the window
    const [sheet, setSheet]   = useState(null);   // 'church' | 'priest' | 'period' | null

    const matches = m =>
      (church === "all" || m.church === church) &&
      (priest === "all" || m.presider === priest) &&
      (period === "all" || partOfDay(m.time) === period);

    // One group per day in the rolling window (today → +6), filtered & sorted.
    const groups = useMemo(() => {
      return WINDOW
        .filter(w => day === "all" || w.iso === day)
        .map(w => ({ w, masses: massesForDate(w).filter(matches).sort((a, b) => a.time.localeCompare(b.time)) }))
        .filter(g => g.masses.length > 0);
    }, [church, priest, period, day]);

    const total = groups.reduce((n, g) => n + g.masses.length, 0);
    const anyFilter = church !== "all" || priest !== "all" || period !== "all" || day !== "all";
    const clearAll = () => { setChurch("all"); setPriest("all"); setPeriod("all"); setDay("all"); };

    const churchLabel = church === "all" ? "All" : churchById(church).name.replace("St. ", "");
    const priestLabel = priest === "all" ? "All" : priestById(priest).name.replace("Fr. ", "");
    const periodLabel = period === "all" ? "All" : period;
    const A = window.APP;

    return (
      <div id="shell">
        {/* Header */}
        <header style={{ padding: "22px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold-deep)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {window.CHURCHES.length} Parishes · Omaha Area
              </div>
              <h1 style={{ margin: "7px 0 0", fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.05, whiteSpace: "nowrap" }}>Mass Times</h1>
            </div>
            <div style={{ textAlign: "right", paddingBottom: 2, flexShrink: 0, paddingLeft: 10 }}>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{total}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-faint)", letterSpacing: "0.03em" }}>masses</div>
            </div>
          </div>
        </header>

        {/* Sticky filters */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "linear-gradient(var(--cream) 78%, rgba(246,241,231,0))", paddingBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, padding: "4px 18px 12px", overflowX: "auto" }}>
            <FilterPill label="Church" value={churchLabel} active={church !== "all"} onClick={() => setSheet("church")} />
            <FilterPill label="Priest" value={priestLabel} active={priest !== "all"} onClick={() => setSheet("priest")} />
            <FilterPill label="Time" value={periodLabel} active={period !== "all"} onClick={() => setSheet("period")} />
            {anyFilter && (
              <button onClick={clearAll} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 12px", borderRadius: 999, background: "transparent", color: "var(--ink-soft)", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                Clear
              </button>
            )}
          </div>
          <DayBar value={day} onChange={setDay} />
        </div>

        {/* List */}
        <main style={{ flex: 1, padding: "8px 14px 24px" }}>
          {groups.length === 0 && <Empty onClear={clearAll} />}
          {groups.map(g => <DaySection key={g.w.iso} w={g.w} masses={g.masses} />)}

          {/* Parishes directory */}
          <section style={{ marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 10px" }}>
              <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Parishes</h2>
              <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            <div style={{ borderRadius: "var(--r-md)", overflow: "hidden", boxShadow: "var(--shadow)", border: "1px solid var(--line-soft)" }}>
              {window.CHURCHES.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <div style={{ height: 1, background: "var(--line-soft)", marginLeft: 16 }} />}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 15px", background: "var(--surface)" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
                        {c.name} <span style={{ fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: 600, color: "var(--ink-faint)" }}>· {c.town}</span>
                      </div>
                      {c.pastor && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>{c.pastor}</div>}
                      <div style={{ display: "flex", gap: 16, marginTop: 7 }}>
                        <a href={c.website} target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 600, color: "var(--gold-deep)", textDecoration: "none" }}>Website ↗</a>
                        <a href={c.bulletin} target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 600, color: "var(--gold-deep)", textDecoration: "none" }}>Bulletin ↗</a>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </section>

          {/* Source note */}
          <div style={{ textAlign: "center", padding: "14px 16px 8px", color: "var(--ink-faint)", fontSize: 11.5, lineHeight: 1.55 }}>
            <div>Showing the next 7 days · presiders fill in as new bulletins are posted</div>
            <div style={{ marginTop: 4 }}>{A.presiderNote}</div>
          </div>
        </main>

        {/* Church sheet */}
        <Sheet open={sheet === "church"} title="Filter by church" onClose={() => setSheet(null)}>
          <OptionRow label="All churches" sub="Every parish below" selected={church === "all"} onClick={() => { setChurch("all"); setSheet(null); }} />
          {window.CHURCHES.map(c => (
            <OptionRow key={c.id} label={c.name} sub={c.pastor ? `${c.town} · ${c.pastor}` : c.town} dot={c.color} selected={church === c.id} onClick={() => { setChurch(c.id); setSheet(null); }} />
          ))}
        </Sheet>

        {/* Priest sheet */}
        <Sheet open={sheet === "priest"} title="Filter by priest" onClose={() => setSheet(null)}>
          <OptionRow label="All priests" sub="Priests are listed for St. Columbkille" selected={priest === "all"} onClick={() => { setPriest("all"); setSheet(null); }} />
          {window.PRIESTS.map(p => (
            <OptionRow key={p.id} label={p.name} sub={p.role} dot={p.color} selected={priest === p.id} onClick={() => { setPriest(p.id); setSheet(null); }} />
          ))}
        </Sheet>

        {/* Time-of-day sheet */}
        <Sheet open={sheet === "period"} title="Filter by time of day" onClose={() => setSheet(null)}>
          <OptionRow label="Any time" selected={period === "all"} onClick={() => { setPeriod("all"); setSheet(null); }} />
          {PERIODS.map(p => (
            <OptionRow key={p} label={p}
              sub={p === "Morning" ? "Before noon" : p === "Afternoon" ? "Noon – 5 PM" : "5 PM and later"}
              selected={period === p} onClick={() => { setPeriod(p); setSheet(null); }} />
          ))}
        </Sheet>
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
