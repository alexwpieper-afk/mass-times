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

# ---- Churches shown in the app (divider colour, town, bulletin link) ----
CHURCHES = [
    {"id": "columbkille", "name": "St. Columbkille", "town": "Papillion", "color": "#9E6B3F",
     "bulletin": "https://www.saintcolumbkille.org/news/bulletin"},
    {"id": "matthew", "name": "St. Matthew", "town": "Bellevue", "color": "#5E7C6B",
     "bulletin": "https://stmatthewbellevue.org/news/bulletin"},
    {"id": "patrick", "name": "St. Patrick", "town": "Gretna", "color": "#5C6E8C",
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
}

# Map the short presider token used in the bulletin -> full priest record.
# The bulletin writes "Fr. Tom" for the pastor (Tom Greisen) and "Fr. Magnuson"
# for the retired Tom Magnuson, so the tokens are unambiguous.
PRIESTS = {
    "Fr. Tom":       {"id": "greisen",  "name": "Fr. Tom Greisen",   "role": "Pastor",            "initials": "TG", "color": "#9E6B3F"},
    "Fr. Moser":     {"id": "moser",    "name": "Fr. Patrick Moser", "role": "Associate Pastor",  "initials": "PM", "color": "#5E7C6B"},
    "Fr. Magnuson":  {"id": "magnuson", "name": "Fr. Tom Magnuson",  "role": "Retired",           "initials": "TM", "color": "#5C6E8C"},
    "Deacon":        {"id": "deacon",   "name": "Deacon",            "role": "Communion Service", "initials": "Dn", "color": "#8A5E72"},
}

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


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BULLETIN_INDEX})
    with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as r:
        return r.read()


def find_latest_bulletin() -> tuple[str, str]:
    """Return (pdf_url, human_title) for the most recent bulletin."""
    html = get(BULLETIN_INDEX).decode("utf-8", "replace")
    # links look like /news/bulletin/1579-may-31-2026-holy-trinity-sunday/file
    matches = re.findall(r'href="(/news/bulletin/(\d+)-[^"]*?/file)"', html)
    if not matches:
        sys.exit("Could not find any bulletin links on the index page.")
    # highest numeric id == newest
    path, _ = max(matches, key=lambda m: int(m[1]))
    slug = path.split("/")[3]                       # 1579-may-31-2026-holy-trinity-sunday
    title = re.sub(r"^\d+-", "", slug).replace("-", " ").title()
    return BASE + path, title


def to_24h(hour: int, minute: int, ap: str) -> str:
    ap = ap.lower()
    if ap == "p" and hour != 12:
        hour += 12
    if ap == "a" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


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


def parse_masses(pdf_bytes: bytes):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    full = "\n".join(doc[i].get_text() for i in range(doc.page_count))

    # liturgical title / date, e.g. "Holy Trinity Sunday • May 31, 2026"
    week = None
    m = re.search(r"([A-Z][^\n•]*?Sunday[^\n•]*)•\s*([A-Z][a-z]+ \d{1,2},\s*\d{4})", full)
    if m:
        week = f"{m.group(1).strip()} · {m.group(2).strip()}"

    start = full.find("INTENTIONS & PRESIDERS")
    if start == -1:
        sys.exit("Bulletin has no 'INTENTIONS & PRESIDERS' section to parse.")
    # the section ends where the parallel "PARISH EVENTS" column resumes day headers
    section = full[start:start + 2000]
    lines = section.splitlines()

    masses = []
    dates = {}            # day id -> "June 7"
    current_day = None
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        dh = DAY_HEADER_RE.match(line)
        if dh:
            current_day = WEEKDAY_ID[dh.group(1)]
            dates[current_day] = f"{dh.group(2)} {int(dh.group(3))}"
            continue
        tm = TIME_RE.match(line)
        if not tm or current_day is None:
            continue  # intention continuation / noise — skip
        presider_tokens = PRESIDER_RE.findall(line)
        if not presider_tokens:
            continue
        token = presider_tokens[-1]            # presider sits at the end of the line
        token = "Fr. Tom" if token == "Fr. Tom" else token
        if token not in PRIESTS:
            continue
        time24 = to_24h(int(tm.group(1)), int(tm.group(2)), tm.group(3))
        is_communion = "communion service" in line.lower()
        # intention = text between the time and the presider token
        body = line[tm.end():]
        body = body[:body.rfind(token)] if token in body else body
        intention = re.sub(r"\s+", " ", body).strip(" ,")
        mtype, live = classify(current_day, time24, is_communion)
        masses.append({
            "church": "columbkille",
            "day": current_day,
            "time": time24,
            "presider": PRIESTS[token]["id"],
            "type": mtype,
            "livestream": live,
            "intention": "" if is_communion else intention,
        })

    # de-dupe + stable sort by day then time
    seen, unique = set(), []
    for x in masses:
        key = (x["day"], x["time"], x["presider"])
        if key not in seen:
            seen.add(key)
            unique.append(x)
    unique.sort(key=lambda x: (x["day"], x["time"]))
    return unique, week, dates


def build_static_masses():
    masses = []
    for cid, sched in STATIC_SCHEDULES.items():
        for day, time24, mtype in sched:
            masses.append({
                "church": cid, "day": day, "time": time24,
                "presider": None, "type": mtype, "livestream": False, "intention": "",
            })
    return masses


def render_data_js(masses, week, dates, columbkille_source) -> str:
    used = {m.get("presider") for m in masses}
    priests = [p for p in PRIESTS.values() if p["id"] in used]
    days = [{**d, "date": dates.get(d["id"])} for d in DAYS]
    app = {
        "title": "Mass Times",
        "region": "Omaha-area Catholic parishes",
        "week": week,
        "presiderNote": "Presiding priests are listed for St. Columbkille; "
                        "the other parishes publish Mass times only.",
        "sources": [{"name": c["name"], "town": c["town"], "url": c["bulletin"]} for c in CHURCHES],
        "columbkilleSource": columbkille_source,
    }
    j = lambda v: json.dumps(v, ensure_ascii=False, indent=2)
    return (
        "// AUTO-GENERATED by fetch_schedule.py — do not edit by hand.\n"
        f"// St. Columbkille week: {week}\n"
        f"// {columbkille_source}\n\n"
        f"window.APP = {j(app)};\n\n"
        f"window.CHURCHES = {j(CHURCHES)};\n\n"
        f"window.PRIESTS = {j(priests)};\n\n"
        f"window.DAYS = {j(days)};\n\n"
        f"window.MASSES = {j(masses)};\n"
    )


def main():
    print("Finding latest St. Columbkille bulletin…")
    pdf_url, title = find_latest_bulletin()
    print(f"  → {title}\n  → {pdf_url}")
    print("Downloading PDF…")
    pdf_bytes = get(pdf_url)
    print(f"  → {len(pdf_bytes):,} bytes")
    print("Parsing St. Columbkille schedule…")
    columb, week, dates = parse_masses(pdf_bytes)
    if not columb:
        sys.exit("Parsed 0 masses — the bulletin layout may have changed.")

    masses = columb + build_static_masses()
    masses.sort(key=lambda m: (m["day"], m["time"], m["church"]))
    OUT.write_text(render_data_js(masses, week, dates, pdf_url), encoding="utf-8")

    counts = {}
    for m in masses:
        counts[m["church"]] = counts.get(m["church"], 0) + 1
    summary = ", ".join(f"{k}: {v}" for k, v in counts.items())
    print(f"  → St. Columbkille week: {week}")
    print(f"  → {len(masses)} masses total ({summary})")
    print(f"  → wrote {OUT}")


if __name__ == "__main__":
    main()
