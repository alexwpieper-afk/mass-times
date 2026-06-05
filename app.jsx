  const { useState, useMemo } = React;

  /* ---------- helpers ---------- */
  const priestById = id => window.PRIESTS.find(p => p.id === id);

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
  const todayDay = new Date().getDay();

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
        <DayChip label="All week" selected={value === "all"} onClick={() => onChange("all")} />
        {window.DAYS.map(d => (
          <DayChip key={d.id}
            label={d.short}
            sub={d.id === todayDay ? "Today" : null}
            selected={value === d.id}
            onClick={() => onChange(d.id)} />
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
    const priest = priestById(mass.presider);
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

        {/* priest-colored divider */}
        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 3, background: priest.color, opacity: 0.6, flexShrink: 0 }} />

        {/* details — presider + mass type stacked, each gets full width */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, lineHeight: 1.18, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {priest.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{mass.type}</span>
            {mass.livestream && <LiveDot />}
          </div>
        </div>

        {/* priest avatar */}
        <Initials priest={priest} size={36} />
      </div>
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
        <div style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 20, lineHeight: 1.5 }}>Try a different priest, time of day, or day.</div>
        <button onClick={onClear} style={{ padding: "10px 18px", borderRadius: 999, background: "var(--ink)", color: "#fff", fontSize: 14, fontWeight: 600 }}>Clear filters</button>
      </div>
    );
  }

  /* ---------- main app ---------- */
  function App() {
    const [priest, setPriest] = useState("all");
    const [period, setPeriod] = useState("all"); // Morning | Afternoon | Evening | all
    const [day, setDay]       = useState("all");
    const [sheet, setSheet]   = useState(null);   // 'priest' | 'period' | null

    const filtered = useMemo(() => {
      return window.MASSES.filter(m =>
        (priest === "all" || m.presider === priest) &&
        (period === "all" || partOfDay(m.time) === period) &&
        (day === "all" || m.day === day)
      );
    }, [priest, period, day]);

    // group by day, each day's masses sorted by time
    const groups = useMemo(() => {
      const byDay = {};
      filtered.forEach(m => { (byDay[m.day] = byDay[m.day] || []).push(m); });
      return window.DAYS
        .filter(d => byDay[d.id])
        .map(d => ({ day: d, masses: byDay[d.id].slice().sort((a, b) => a.time.localeCompare(b.time)) }));
    }, [filtered]);

    const anyFilter = priest !== "all" || period !== "all" || day !== "all";
    const clearAll = () => { setPriest("all"); setPeriod("all"); setDay("all"); };

    const priestLabel = priest === "all" ? "All" : priestById(priest).name.replace("Fr. ", "");
    const periodLabel = period === "all" ? "All" : period;
    const P = window.PARISH;

    return (
      <div id="shell">
        {/* Header */}
        <header style={{ padding: "22px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold-deep)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {P.name} · {P.town.split(",")[0]}, NE
              </div>
              <h1 style={{ margin: "7px 0 0", fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.05, whiteSpace: "nowrap" }}>Mass Times</h1>
            </div>
            <div style={{ textAlign: "right", paddingBottom: 2, flexShrink: 0, paddingLeft: 10 }}>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{filtered.length}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-faint)", letterSpacing: "0.03em" }}>masses</div>
            </div>
          </div>
        </header>

        {/* Sticky filters */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "linear-gradient(var(--cream) 78%, rgba(246,241,231,0))", paddingBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, padding: "4px 18px 12px", overflowX: "auto" }}>
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
          {groups.map(g => (
            <section key={g.day.id} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 10px" }}>
                <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--ink)", letterSpacing: "0.01em" }}>
                  {g.day.long}
                  {g.day.id === todayDay && <span style={{ marginLeft: 8, fontFamily: "var(--font-ui)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: "var(--gold)", padding: "2px 7px", borderRadius: 99, verticalAlign: "middle" }}>Today</span>}
                </h2>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-faint)" }}>{g.masses.length}</span>
              </div>
              <div style={{ borderRadius: "var(--r-md)", overflow: "hidden", boxShadow: "var(--shadow)", border: "1px solid var(--line-soft)" }}>
                {g.masses.map((m, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <div style={{ height: 1, background: "var(--line-soft)", marginLeft: 16 }} />}
                    <MassRow mass={m} />
                  </React.Fragment>
                ))}
              </div>
            </section>
          ))}

          {/* Source attribution */}
          <div style={{ textAlign: "center", padding: "8px 16px 8px", color: "var(--ink-faint)", fontSize: 11.5, lineHeight: 1.6 }}>
            <div>Intentions &amp; presiders from the parish bulletin</div>
            <div>
              <a href={P.sourceUrl} target="_blank" rel="noopener" style={{ color: "var(--gold-deep)", fontWeight: 600, textDecoration: "none" }}>
                {P.week || P.sourceTitle}
              </a>
            </div>
          </div>
        </main>

        {/* Priest sheet */}
        <Sheet open={sheet === "priest"} title="Filter by priest" onClose={() => setSheet(null)}>
          <OptionRow label="All priests" selected={priest === "all"} onClick={() => { setPriest("all"); setSheet(null); }} />
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
