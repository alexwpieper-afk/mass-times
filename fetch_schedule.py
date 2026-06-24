#!/usr/bin/env python3
"""
Build data.js for the Mass Times web app, covering several Omaha-area parishes.

- St. Columbkille (Papillion): its bulletin is a real text PDF that lists each
  Mass's time AND presiding priest in an "INTENTIONS & PRESIDERS" grid, so we
  parse the newest bulletin live every week.
- St. Matthew (Bellevue) and St. Patrick (Gretna): their bulletins are scanned
  IMAGES with no text layer, and they publish a fixed weekly Mass schedule
  rather than per-Mass presiders. Their standing schedules are stored below
  (read once from the bulletins) — no per-week parsing, no presiders.

The current week's calendar dates come from the St. Columbkille bulletin and are
shared by all parishes (same archdiocese, same week).

Re-run to refresh (the weekly GitHub Action does this automatically):

    python3 fetch_schedule.py

Dependencies: pymupdf  (pip install --user pymupdf certifi)
"""

import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import fitz  # PyMuPDF

# macOS python.org builds often ship without a usable system CA bundle, so
# prefer certifi's and fall back to an unverified context as a last resort.
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl._create_unverified_context()

BULLETIN_INDEX = "https://www.saintcolumbkille.org/news/bulletin"
BASE = "https://www.saintcolumbkille.org"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
OUT = Path(__file__).with_name("data.js")

# ---- Churches shown in the app (colour, town, pastor, website, bulletin) ----
# St. Columbkille's pastor is also parsed live from its bulletin (see parse_pastor)
# so the label stays correct through Fr. Greisen's June 2026 retirement.
CHURCHES = [
    {"id": "columbkille", "name": "St. Columbkille", "town": "Papillion", "color": "#9E6B3F",
     "pastor": "Fr. Tom Greisen",
     "website": "https://www.saintcolumbkille.org",
     "bulletin": "https://www.saintcolumbkille.org/news/bulletin"},
    {"id": "matthew", "name": "St. Matthew", "town": "Bellevue", "color": "#5E7C6B",
     "pastor": "Fr. Leo Rigatuso",
     "website": "https://stmatthewbellevue.org",
     "bulletin": "https://stmatthewbellevue.org/news/bulletin"},
    {"id": "mary", "name": "St. Mary's", "town": "Bellevue", "color": "#8A5E72",
     "pastor": "Fr. Lydell Lape",
     "website": "https://stmarysbellevue.com",
     "bulletin": "https://stmarysbellevue.com/bulletin"},
    {"id": "patrick", "name": "St. Patrick", "town": "Gretna", "color": "#5C6E8C",
     "pastor": "Fr. Gregory Baxter",
     "website": "https://stpatricksgretna.org",
     "bulletin": "https://stpatricksgretna.org/bulletins/"},
]

# ---- Standing weekly schedules for the image-PDF parishes (day, time24, type).
# Read directly from each parish's published Mass schedule; no presiders listed.
STATIC_SCHEDULES = {
    "matthew": [   # Sat 5pm Vigil; Sun 9 & 11am; Mon-Fri 9am
        (6, "17:00", "Vigil"),
        (0, "09:00", "Sunday Mass"), (0, "11:00", "Sunday Mass"),
        (1, "09:00", "Daily Mass"), (2, "09:00", "Daily Mass"), (3, "09:00", "Daily Mass"),
        (4, "09:00", "Daily Mass"), (5, "09:00", "Daily Mass"),
    ],
    "patrick": [   # Sat 5pm Vigil; Sun 8/10am & Noon; Tue 6pm; Mon/Wed/Thu/Fri 7:30am
        (6, "17:00", "Vigil"),
        (0, "08:00", "Sunday Mass"), (0, "10:00", "Sunday Mass"), (0, "12:00", "Sunday Mass"),
        (1, "07:30", "Daily Mass"), (2, "18:00", "Daily Mass"), (3, "07:30", "Daily Mass"),
        (4, "07:30", "Daily Mass"), (5, "07:30", "Daily Mass"),
    ],
    "mary": [      # Mon/Tue/Thu/Fri 7 & 8am; Wed 7 & 8:30am; Sat 8am + 5pm Vigil;
                   # Sun 8/10am, Noon, 1:30pm Spanish
        (6, "17:00", "Vigil"),
        (0, "08:00", "Sunday Mass"), (0, "10:00", "Sunday Mass"),
        (0, "12:00", "Sunday Mass"), (0, "13:30", "Sunday Mass · Spanish"),
        (1, "07:00", "Daily Mass"), (1, "08:00", "Daily Mass"),
        (2, "07:00", "Daily Mass"), (2, "08:00", "Daily Mass"),
        (3, "07:00", "Daily Mass"), (3, "08:30", "Daily Mass"),
        (4, "07:00", "Daily Mass"), (4, "08:00", "Daily Mass"),
        (5, "07:00", "Daily Mass"), (5, "08:00", "Daily Mass"),
        (6, "08:00", "Daily Mass"),
    ],
}

# Map the short presider token used in the bulletin -> full priest record.
# The bulletin writes "Fr. Tom" for the pastor (Tom Greisen) and "Fr. Magnuson"
# for the retired Tom Magnuson, so the tokens are unambiguous.
KNOWN_PRIESTS = {
    "Fr. Tom":       {"id": "greisen",  "name": "Fr. Tom Greisen",   "role": "Pastor",            "initials": "TG", "color": "#9E6B3F"},
    "Fr. Moser":     {"id": "moser",    "name": "Fr. Patrick Moser", "role": "Associate Pastor",  "initials": "PM", "color": "#5E7C6B"},
    "Fr. Magnuson":  {"id": "magnuson", "name": "Fr. Tom Magnuson",  "role": "Retired",           "initials": "TM", "color": "#5C6E8C"},
    "Deacon":        {"id": "deacon",   "name": "Deacon",            "role": "Communion Service", "initials": "Dn", "color": "#8A5E72"},
}

# Visiting/guest priests appear in the bulletin without being in the standing
# clergy list (e.g. "Fr. Reddy"). We must NOT drop their Masses, so any
# unrecognised presider token gets a record built on the fly.
_DYN_COLORS = ["#7A6BA8", "#3F7A8C", "#A8743F", "#5F8C5C", "#8C5C72"]
_DISCOVERED = {}


def resolve_priest(token: str) -> dict:
    if token in KNOWN_PRIESTS:
        return KNOWN_PRIESTS[token]
    if token in _DISCOVERED:
        return _DISCOVERED[token]
    names = re.sub(r"\b(Fr|Rev|Msgr|Father)\.?", "", token).split()
    if len(names) >= 2:
        initials = (names[0][0] + names[-1][0]).upper()
    elif names:
        initials = names[0][:2].title()
    else:
        initials = "Fr"
    slug = re.sub(r"[^a-z0-9]+", "-", "-".join(names).lower()).strip("-") or "guest"
    rec = {"id": slug, "name": token.strip(), "role": "Visiting priest",
           "initials": initials, "color": _DYN_COLORS[len(_DISCOVERED) % len(_DYN_COLORS)]}
    _DISCOVERED[token] = rec
    return rec

DAYS = [
    {"id": 0, "short": "Sun", "long": "Sunday"},
    {"id": 1, "short": "Mon", "long": "Monday"},
    {"id": 2, "short": "Tue", "long": "Tuesday"},
    {"id": 3, "short": "Wed", "long": "Wednesday"},
    {"id": 4, "short": "Thu", "long": "Thursday"},
    {"id": 5, "short": "Fri", "long": "Friday"},
    {"id": 6, "short": "Sat", "long": "Saturday"},
]
WEEKDAY_ID = {"Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
              "Thursday": 4, "Friday": 5, "Saturday": 6}

PRESIDER_RE = re.compile(r"(Fr\.\s+\w+|Deacon)")
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*([ap])m", re.IGNORECASE)
DAY_HEADER_RE = re.compile(
    r"^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2})")


def get(url: str, attempts: int = 5, timeout: int = 90) -> bytes:
    """Fetch a URL with browser-like headers and retry transient failures.
    The parish server throttles datacenter IPs (e.g. GitHub Actions) — both
    HTTP 429 and stalled/slow transfers — so we use a generous timeout and
    back off and retry rather than failing the whole refresh."""
    headers = {
        "User-Agent": UA,
        "Referer": BULLETIN_INDEX,
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            retryable = e.code in (429, 500, 502, 503, 504)
            if not retryable or i == attempts - 1:
                raise
            ra = e.headers.get("Retry-After") if e.headers else None
            wait = int(ra) if (ra and ra.isdigit()) else 5 * (2 ** i)  # 5,10,20,40
            print(f"    …HTTP {e.code}; retrying in {min(wait, 120)}s "
                  f"(attempt {i + 1}/{attempts})")
            time.sleep(min(wait, 120))
        except urllib.error.URLError as e:
            last = e
            if i == attempts - 1:
                raise
            print(f"    …{e}; retrying (attempt {i + 1}/{attempts})")
            time.sleep(5 * (2 ** i))
    raise last  # pragma: no cover


def find_latest_bulletins(n: int = 2) -> list[dict]:
    """Return the n most recent bulletins, newest first, each as
    {url, title, year, month} — the year/month come from the slug's date
    (e.g. .../1599-june-14-2026-... ), which is more reliable than the
    liturgical title for anchoring the bulletin's dates."""
    html = get(BULLETIN_INDEX).decode("utf-8", "replace")
    # links look like /news/bulletin/1579-may-31-2026-holy-trinity-sunday/file
    matches = re.findall(r'href="(/news/bulletin/(\d+)-[^"]*?/file)"', html)
    if not matches:
        sys.exit("Could not find any bulletin links on the index page.")
    out, seen = [], set()
    for path, num in sorted(matches, key=lambda m: int(m[1]), reverse=True):
        if num in seen:
            continue
        seen.add(num)
        slug = path.split("/")[3]                   # 1579-may-31-2026-holy-trinity-sunday
        title = re.sub(r"^\d+-", "", slug).replace("-", " ").title()
        dm = re.search(r"-([a-z]+)-\d{1,2}-(\d{4})", path, re.I)
        month = MONTHS_FULL.get(dm.group(1).title()) if dm else None
        year = int(dm.group(2)) if dm else None
        out.append({"url": BASE + path, "title": title, "year": year, "month": month})
        if len(out) >= n:
            break
    return out


MONTHS_FULL = {"January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
               "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
               "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "Jun": 6, "Jul": 7, "Aug": 8,
               "Sept": 9, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def iso_date(month_name: str, day: int, base_year: int, base_month: int) -> str:
    """Build an ISO date from a bulletin day-header month/day, using the
    bulletin title's year. Rolls the year forward across a Dec->Jan boundary."""
    mn = MONTHS_FULL.get(month_name)
    if mn is None:
        return None
    year = base_year + (1 if mn < base_month - 6 else 0)
    return f"{year:04d}-{mn:02d}-{int(day):02d}"


def to_24h(hour: int, minute: int, ap: str) -> str:
    ap = ap.lower()
    if ap == "p" and hour != 12:
        hour += 12
    if ap == "a" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def parse_pastor(text: str):
    """Pull the current pastor's name from the bulletin clergy list, e.g.
    'FR. TOM GREISEN, PASTOR' -> 'Fr. Tom Greisen'. Skips 'ASSOCIATE PASTOR'."""
    m = re.search(r"\n\s*((?:FR|REV|MSGR)\.[A-Z.'’\- ]+?),\s*PASTOR\b", text)
    return m.group(1).strip().title() if m else None


def classify(day_id: int, time24: str, is_communion: bool):
    """Return (type_label, livestreamed)."""
    # M-F 8:15 AM and the Saturday 5:00 PM Vigil are livestreamed per the bulletin.
    live = (1 <= day_id <= 5 and time24 == "08:15") or (day_id == 6 and time24 == "17:00")
    if is_communion:
        return "Communion Service", False
    hour = int(time24.split(":")[0])
    if day_id == 0:
        return "Sunday Mass", False
    if day_id == 6 and hour >= 16:
        return "Vigil", live
    return "Daily Mass", live


def parse_bulletin(pdf_bytes: bytes, base_year: int, base_month: int):
    """Parse one St. Columbkille bulletin into date-keyed masses with presiders.
    base_year/base_month anchor the day-header dates (from the bulletin slug).
    Returns (masses, week_label, pastor). Each mass: {church, date (ISO), time,
    presider, type, livestream}."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    full = "\n".join(doc[i].get_text() for i in range(doc.page_count))

    # liturgical title for display, e.g. "Holy Trinity Sunday • May 31, 2026"
    week = None
    m = re.search(r"([A-Z][^\n•]*?Sunday[^\n•]*)•\s*([A-Z][a-z]+ \d{1,2},\s*\d{4})", full)
    if m:
        week = f"{m.group(1).strip()} · {m.group(2).strip()}"

    pastor = parse_pastor(full)

    start = full.find("INTENTIONS & PRESIDERS")
    if start == -1:
        sys.exit("Bulletin has no 'INTENTIONS & PRESIDERS' section to parse.")
    section = full[start:start + 2000]

    masses = []
    cur_iso = cur_wd = None
    for raw in section.splitlines():
        line = raw.strip()
        if not line:
            continue
        dh = DAY_HEADER_RE.match(line)
        if dh:
            cur_wd = WEEKDAY_ID[dh.group(1)]
            cur_iso = iso_date(dh.group(2), int(dh.group(3)), base_year, base_month) if base_year else None
            continue
        tm = TIME_RE.match(line)
        if not tm or cur_iso is None:
            continue  # intention continuation / noise — skip
        tokens = PRESIDER_RE.findall(line)
        if not tokens:
            continue
        rec = resolve_priest(tokens[-1])            # presider sits at the end of the line
        time24 = to_24h(int(tm.group(1)), int(tm.group(2)), tm.group(3))
        is_communion = "communion service" in line.lower()
        mtype, live = classify(cur_wd, time24, is_communion)
        masses.append({
            "church": "columbkille", "date": cur_iso, "time": time24,
            "presider": rec["id"], "type": mtype, "livestream": live,
        })
    return masses, week, pastor


def build_weekly_masses():
    """Static parishes as recurring weekday patterns (no dates, no presiders).
    The app expands these onto whatever dates fall in the rolling window."""
    out = []
    for cid, sched in STATIC_SCHEDULES.items():
        for day, time24, mtype in sched:
            out.append({"church": cid, "day": day, "time": time24, "type": mtype})
    return out


def render_data_js(dated, weekly, week, pastor, sources) -> str:
    used = {m.get("presider") for m in dated}
    all_priests = list(KNOWN_PRIESTS.values()) + list(_DISCOVERED.values())
    priests = [p for p in all_priests if p["id"] in used]
    churches = [dict(c) for c in CHURCHES]
    if pastor:                                   # keep current through retirement
        for c in churches:
            if c["id"] == "columbkille":
                c["pastor"] = pastor
    coverage = ({"start": min(m["date"] for m in dated),
                 "end": max(m["date"] for m in dated)} if dated else None)
    app = {
        "title": "Mass Times",
        "region": "Omaha-area Catholic parishes",
        "week": week,
        "presiderNote": "Presiding priests are listed for St. Columbkille; "
                        "the other parishes publish Mass times only.",
        "columbkilleCoverage": coverage,
    }
    j = lambda v: json.dumps(v, ensure_ascii=False, indent=2)
    return (
        "// AUTO-GENERATED by fetch_schedule.py — do not edit by hand.\n"
        f"// St. Columbkille week: {week}\n"
        + "".join(f"// source: {s}\n" for s in sources) + "\n"
        f"window.APP = {j(app)};\n\n"
        f"window.CHURCHES = {j(churches)};\n\n"
        f"window.PRIESTS = {j(priests)};\n\n"
        # St. Columbkille masses, keyed by actual date (presiders included).
        f"window.DATED_MASSES = {j(dated)};\n\n"
        # Other parishes, recurring weekly patterns the app expands onto dates.
        f"window.WEEKLY_MASSES = {j(weekly)};\n"
    )


def main():
    print("Finding latest St. Columbkille bulletins…")
    bulletins = find_latest_bulletins(2)
    for b in bulletins:
        print(f"  → {b['title']}\n     {b['url']}")

    dated, week, pastor, sources = [], None, None, []
    for idx, b in enumerate(bulletins):
        time.sleep(3)  # be polite between requests to the rate-limiting server
        print(f"Downloading {b['title']}…")
        pdf = get(b["url"], attempts=3, timeout=300)   # 15 MB, often throttled from CI
        print(f"  → {len(pdf):,} bytes")
        masses, w, p = parse_bulletin(pdf, b["year"], b["month"])
        print(f"  → parsed {len(masses)} masses")
        dated += masses
        sources.append(b["url"])
        if idx == 0:                               # newest defines current week + pastor
            week, pastor = w, p

    if not dated:
        sys.exit("Parsed 0 masses — the bulletin layout may have changed.")

    # merge: one mass per (date, time); newest bulletin wins on any overlap
    merged, seen = [], set()
    for m in sorted(dated, key=lambda x: (x["date"], x["time"])):
        key = (m["date"], m["time"])
        if key not in seen:
            seen.add(key)
            merged.append(m)

    weekly = build_weekly_masses()
    OUT.write_text(render_data_js(merged, weekly, week, pastor, sources), encoding="utf-8")
    if pastor:
        print(f"  → St. Columbkille pastor: {pastor}")
    print(f"  → St. Columbkille presider coverage: "
          f"{merged[0]['date']} … {merged[-1]['date']} ({len(merged)} masses)")
    print(f"  → {len(weekly)} weekly masses across {len(STATIC_SCHEDULES)} other parishes")
    print(f"  → wrote {OUT}")


if __name__ == "__main__":
    main()
