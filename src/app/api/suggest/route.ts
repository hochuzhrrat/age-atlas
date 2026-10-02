import { people } from "@/lib/data";
import type { Suggestion } from "@/lib/people";
import { parseQuery, rankPeopleByName } from "@/lib/query";

// Name suggestions while typing: the six best matches for the name part of
// the query ("dario 33" → the Darios), with what a visitor needs to tell
// them apart. The library is static, so answers can be cached for a while.

const LIMIT = 6;
const MIN_NAME_LENGTH = 2;

export function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const { name } = parseQuery(query);
  const matches = name.length >= MIN_NAME_LENGTH ? rankPeopleByName(people, name, LIMIT) : [];
  const suggestions: Suggestion[] = matches.map(({ id, name, domain, birthYear, deathYear }) => ({
    id,
    name,
    domain,
    birthYear,
    ...(deathYear ? { deathYear } : {}),
  }));

  return Response.json(suggestions, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
