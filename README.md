# Mass Times — Omaha-area parishes

**Live site: <https://alexwpieper-afk.github.io/mass-times/>**

A clean, mobile-first web app showing the week's Mass schedule across several
Omaha-area Catholic parishes, with filters by **church, priest, time of day, and
day of week**.

## The parishes (and why they're handled differently)

| Parish | Bulletin | What we get | How |
|--------|----------|-------------|-----|
| **St. Columbkille** (Papillion) | text PDF w/ presider grid | Mass times **+ the presiding priest** of each Mass | parsed live every week |
| **St. Matthew** (Bellevue) | scanned image PDF | Mass times only | standing schedule, stored in the script |
| **St. Mary's** (Bellevue) | text PDF, times only | Mass times only | standing schedule, stored in the script |
| **St. Patrick** (Gretna) | scanned image PDF | Mass times only | standing schedule, stored in the script |

St. Columbkille's bulletin uniquely prints an *"Intentions & Presiders"* grid in a
real text layer, so `fetch_schedule.py` downloads the newest one and reads the
celebrant for every Mass. The other parishes publish only a *fixed* weekly Mass
schedule with no per-Mass presider, so their times are stored directly in the
script (read once from each parish's published schedule) — there's nothing to
parse weekly and no priest to show for them. (St. Mary's bulletin *is* a text PDF,
but it lists Mass *intentions*, not presiders, and frames its week Mon–Sun rather
than Sun–Sat, so it's treated as a standing schedule like the image-PDF parishes.)

## Files

| File | What it is |
|------|------------|
| `fetch_schedule.py` | Builds `data.js`: parses St. Columbkille's bulletin live + merges the static schedules. |
| `data.js` | **Auto-generated** data (`window.APP`, `CHURCHES`, `PRIESTS`, `DAYS`, `MASSES`). Don't edit by hand. |
| `app.jsx` / `app.js` | The UI source and its pre-compiled production build. |
| `index.html` | Page shell (production React from CDN + `data.js` + `app.js`). |
| `build.sh` | Compiles `app.jsx` → `app.js` with esbuild. |

## Refresh the schedule

```bash
python3 fetch_schedule.py     # re-parses St. Columbkille, re-merges static schedules
```

Dependencies (one-time): `python3 -m pip install --user pymupdf certifi`

## Run locally

```bash
python3 -m http.server 4173   # then open http://localhost:4173
```

## Edit the UI

```bash
# edit app.jsx, then:
./build.sh                    # rewrites app.js (visitors don't run an in-browser compiler)
```

## Deployment & automatic updates

Hosted on **GitHub Pages** from the `main` branch of `alexwpieper-afk/mass-times`.
Publish by committing and pushing:

```bash
git add -A && git commit -m "..." && git push
```

A scheduled GitHub Action (`.github/workflows/refresh-schedule.yml`) runs every
**Sunday and Monday** morning, re-runs `fetch_schedule.py`, and commits `data.js`
if it changed — which republishes the site. Two runs mean a newly-posted weekend
bulletin is caught promptly, with Monday as a backup, so St. Columbkille's
presiders stay current with no manual work. (The two image-PDF parishes change
rarely; update their schedules by editing `STATIC_SCHEDULES` in
`fetch_schedule.py` if their published times change.)

## Adding or changing a parish

In `fetch_schedule.py`:

- **A parish that publishes times only** (most common): add it to `CHURCHES`
  (id, name, town, accent colour, bulletin URL) and add its weekly grid to
  `STATIC_SCHEDULES` as `(dayId, "HH:MM", "Type")` rows (dayId 0=Sun … 6=Sat).
- **A parish whose bulletin has a parseable text-layer presider grid**: that needs
  custom parsing like the St. Columbkille path — open an issue / extend `parse_masses`.

## Notes

- St. Columbkille presiders **rotate weekly**; the Sunday/Monday auto-refresh keeps them current.
- The current week's calendar dates (shown in each day header) come from the
  St. Columbkille bulletin and are shared by all parishes (same archdiocese/week).
- If St. Columbkille's bulletin layout changes and parsing yields 0 Masses, the
  script exits with an error rather than writing an empty schedule.
