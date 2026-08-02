# Teaching HQ CSV drop folder

Put your Notion CSV exports here, then run the importer:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
node scripts/seed-teaching-hq.js          # import (appends)
node scripts/seed-teaching-hq.js --wipe   # wipe existing teaching docs, then import
```

## How to export from Notion

1. Open **Teaching HQ — 2026–27** in Notion.
2. For **each** of the 9 databases, click **•••** (top-right of the database) →
   **Export** → set **Export format: Markdown & CSV**, then export.
   - If a database is inline, open it as a full page first, or export the whole
     Teaching HQ page with **Include subpages** on.
3. Unzip and drop the `.csv` files into this folder. **Keep Notion's filenames**
   — the importer matches them by the database name (e.g. `Lesson Days *.csv`).

Expected files (name prefixes the importer looks for):

| Database | Filename starts with |
|---|---|
| Courses | `Courses` |
| Lesson Days | `Lesson Days` |
| Lesson Plans | `Lesson Plans` |
| Deadlines & Assessments | `Deadlines` |
| Tasks | `Tasks` |
| Materials & Lab Prep | `Materials` |
| Certifications & Compliance | `Certifications` |
| Email Tracker | `Email Tracker` |
| District Calendar | `District Calendar` |

## Privacy

The actual `.csv` files are **git-ignored** — they can contain student and
parent names (Email Tracker) and are never committed. Only this README is
tracked.
