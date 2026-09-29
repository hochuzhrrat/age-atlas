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

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project layout

- `src/app/page.tsx` — the single page UI
- `src/lib/people.ts` — person types and age / lifespan / fact helpers
- `src/lib/query.ts` — search parsing and resolution
- `src/data/mockData.json` — demo dataset (MVP has no backend)
- `docs/my_docs/` — product (`prd.md`) and tech (`tech.md`) notes

Stack: Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui, Lucide.
