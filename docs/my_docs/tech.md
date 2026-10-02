# Age Atlas - Tech

## Stack
- Framework: Next.js (App Router)
- Styling: Tailwind CSS
- UI Components: shadcn/ui (Base UI)
- Motion: Motion (layout animations)
- Icons: Lucide React

## Data
- Library built offline and committed to the repo: `src/data/people.json` (people, portraits, credits) and `src/data/milestones.json` (dated one-line facts)
- Source of people: Wikidata (notable humans born 1800–2010 with a Commons portrait and an English Wikipedia article) plus everyone in English Wikipedia's daily top-1000 articles over the last year, via `scripts/build-people.mjs`. The audience is American: fame is English Wikipedia views, not the number of language editions
- Source of facts: English Wikipedia articles, summarised into milestones by Claude through the Message Batches API, via `scripts/extract-milestones.mjs`
- Portraits: Wikimedia Commons, served on demand at the needed width; author, licence and photo year shown in the page credits. For the most viewed people, dated portraits from Commons' "<Person> in <year>" categories (`scripts/fetch-era-portraits.mjs`), so the page shows the photo nearest to the selected year
- Popularity: English Wikipedia pageviews (last 12 months) weighted by domain towards music, film and sport
- No database; the library is loaded in memory on the server

## Architecture
- Single page, rendered on the server from the URL: `?q=` (search text) or `?p=<wikidata id>&y=<year>&s=<shuffle>`
- The server resolves the subject and year, picks the six contemporaries (seeded, so a URL is stable) and sends only those seven people to the client
- The client keeps the year while the rule is dragged; releasing it, clicking a name, or Shuffle updates the URL and the server re-renders

- Search suggestions: `/api/suggest` ranks names on the server (whole name, whole word, word starts, substring; ties by views) and the field shows the six best with Base UI Autocomplete

## Next steps
- Dated facts without paid API calls: Wikidata claims with dates (offices held, awards, notable works, teams) as one-line milestones
- Live Wikidata lookup with caching for people outside the library
- Mirror portraits instead of hotlinking Commons in production
