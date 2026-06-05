# Mass Times — St. Columbkille Parish

A clean, mobile-first web app that shows the week's Mass schedule and **who is
presiding at each Mass**, with filters by priest, time of day, and day of week.

The schedule isn't hand-typed — it's **parsed live from the parish bulletin PDF**
published at <https://www.saintcolumbkille.org/news/bulletin>. Each week's bulletin
has an *"Intentions & Presiders"* section listing every Mass time and its
celebrant; `fetch_schedule.py` downloads the newest bulletin, extracts that
section, and writes `data.js`, which the app reads.

## Files

| File | What it is |
|------|------------|
| `fetch_schedule.py` | Downloads the latest bulletin PDF and parses it into `data.js`. |
| `data.js` | **Auto-generated** schedule data (parish info, priests, masses). Do not edit by hand. |
| `index.html` | The app — a self-contained React UI (warm-neutral design, bottom-sheet filters). |

## Refresh the schedule (do this weekly, when a new bulletin posts)

```bash
python3 fetch_schedule.py
```

It finds the most recent bulletin automatically, parses it, and rewrites
`data.js`. Reload the page to see the new week.

Dependencies (one-time):

```bash
python3 -m pip install --user pymupdf certifi
```

## Run the app

It's a static page. Any of these work:

```bash
# simplest
python3 -m http.server 4173        # then open http://localhost:4173
```

Opening `index.html` directly (file://) also works — the app and its React code
are inlined, and `data.js` loads as a normal script.

## How the parser works

`fetch_schedule.py`:

1. Fetches the bulletin index and picks the highest-numbered (newest) bulletin link.
2. Downloads the PDF (with a browser User-Agent — the server blocks default clients).
3. Reads the text with PyMuPDF and isolates the `INTENTIONS & PRESIDERS` block.
4. For each `Day, Month N` header it reads the Mass lines (`8:15am … Fr. Moser`),
   taking the time and the presider (the last `Fr. X` / `Deacon` token on the line).
5. Classifies each Mass — Sunday Mass / Daily Mass / Vigil / Communion Service —
   and flags the livestreamed ones (M–F 8:15 AM, Sat 5:00 PM).
6. Writes `window.PARISH`, `window.PRIESTS`, `window.DAYS`, `window.MASSES` to `data.js`.

If the bulletin's layout ever changes and parsing yields 0 Masses, the script
exits with an error rather than writing an empty schedule.

## Notes

- Presider assignments **rotate weekly**, so the app reflects whoever the bulletin
  lists for the current week — re-run the fetch to stay current.
- The standing weekly time grid (also on the bulletin masthead / the parish
  "Mass Times" page) matches the parsed times, so the times are stable even as
  presiders change.
