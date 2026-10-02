# Age Atlas

Turn time into something you can see and compare.

Pick a person and a year or an age, and see what they were doing then — next to other notable people who were alive in the same year, at completely different stages of life.

## Search

| Query | Meaning |
| --- | --- |
| `Madonna 1990` | Madonna in 1990 |
| `Madonna at 15` | the year Madonna turned 15 |
| `1990` | the current person in 1990 |
| `30` | the year the current person turned 30 |

Clicking a contemporary makes them the main person for the same year.

The search field always holds a query that reproduces the current view
("Charles III at 41"), like an address bar: focus selects it all, so typing
replaces it, and changing the number is one edit away. `/` focuses the field.

While a name is typed, the six best matches drop down under the field, with
domain and years to tell namesakes apart; picking one keeps the year or age
typed with it ("dario 33" → "Dario Amodei at 33"). Matches come from
`/api/suggest`, so the library never leaves the server.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data

The library is built offline and committed, so the site needs no external
APIs at runtime.

```bash
npm run data:people       # Wikidata → src/data/people.json (~25 min, cached)
npm run data:portraits    # Commons → src/data/portraits.json (dated portraits)
npm run data:milestones   # Wikipedia + Claude → src/data/milestones.json
```

- `scripts/build-people.mjs` builds the library from two sources. Wikidata,
  one birth year at a time: the 60 most-linked people per birth year,
  1800–2010, with a portrait on Wikimedia Commons and an English Wikipedia
  article — the backbone for the 19th century. Then what English Wikipedia
  readers actually look up: every article in the daily top thousand over the
  last year (`TOP_DAYS=365`), resolved to Wikidata; the people among them join
  whatever their sitelinks count, because sitelinks reward encyclopaedic
  reach and the atlas is for readers (Dario Fo has 109 Wikipedias and 45k
  views a year; Dario Amodei 31 and 2.9M). Portrait author, licence and the
  year the photo was taken come from the Commons API; English Wikipedia views
  over the last twelve months from the pageviews API. Tune with `FROM_YEAR`,
  `TO_YEAR`, `PER_YEAR`, `MIN_SITELINKS`, `TOP_DAYS`.
- `scripts/fetch-era-portraits.mjs` collects, for the `TOP=1000` most viewed
  people, one portrait per year from Commons' "<Person> in <year>" categories.
  A year category often holds co-stars and team-mates photographed at the
  same event, so a file that names the person wins, a cropped single shot
  beats a pair, and titles listing three or more people, or opening with
  someone else's name, are skipped (`REPICK=1` re-applies the rules to years
  already fetched). The page shows the portrait nearest to the selected year
  and notes the photo year when it is clearly a different one ("photo 2019").
  Childhood photos are almost never freely licensed, so a 13-year-old is still
  shown as an adult, but labelled.
- `scripts/extract-milestones.mjs` sends each person's Wikipedia article to
  Claude through the Message Batches API and stores 8–12 dated one-line
  milestones per person. Needs `ANTHROPIC_API_KEY` in `.env.local`. Resumable;
  `TOP=200` limits a run to the 200 most notable people still missing
  timelines, `MODEL=` picks the model.
- Raw responses are cached in `scripts/.cache/` (ignored by git).

## How the six are chosen

For a person and a year, the six contemporaries come from everyone alive that
year: one from each life stage (0–14, 15–29, 30–45, 46–60, 61–75, 76+), each
drawn from the twelve most famous people of that stage. Fame is English
Wikipedia views over the last year, weighted by domain: music and film count
in full, sport and fashion 0.8, business 0.6, politics, literature and art
0.4, science 0.3, military and religion 0.15 — this is an atlas of mass
culture. At most two of the six share a domain, at most two come from
outside music, screen, sport and fashion, and none is from the subject's own
domain when possible. The draw is seeded by person, year and a
shuffle counter, so a URL always shows the same six and Shuffle gives a new
set.

## Project layout

- `src/app/page.tsx` — server page: resolves the URL (`?q=`, or `?p=&y=&s=`) into a view
- `src/app/api/suggest/route.ts` — name suggestions for the search field
- `src/components/atlas.tsx` — the page UI: search, subject block, chart, credits
- `src/components/atlas-chart.tsx` — lifespan chart with the draggable year rule and Shuffle
- `src/lib/data.ts` — loads the library and resolves a view (server only)
- `src/lib/select.ts` — seeded selection of the six contemporaries
- `src/lib/query.ts` — search parsing and ranked name matching
- `src/lib/people.ts` — person types and age / fact / portrait helpers
- `src/data/people.json`, `src/data/portraits.json`, `src/data/milestones.json` — the library
- `docs/my_docs/` — product (`prd.md`) and tech (`tech.md`) notes

Stack: Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui (Base UI), Motion, Lucide.

## Design

Editorial, print-like, neutral. Tokens live in `src/app/globals.css`.

- Colour: white paper and near-black ink with a grey scale; one signal blue,
  reserved for the selected year. Light and dark follow the OS setting.
- Type: Geist for text and Geist Mono for labels, ticks and small figures.
- Layout: one shared four-column grid (name · age · lifespan · fact) so the
  year rule runs unbroken from the axis through every row. The subject's
  lifetime is drawn on the axis itself ("Born 1958 — Today"); the rule can go
  anywhere, and the list only ever shows people alive in that year.
- Motion: rows regroup with a layout animation when the year crosses a birth
  or death; the subject block cross-fades. Respects `prefers-reduced-motion`.
