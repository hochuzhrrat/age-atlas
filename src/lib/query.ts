import type { Person } from "@/lib/people";

export type SearchResult =
  | { ok: true; person: Person; year: number }
  | { ok: false; message: string };

export type ParsedQuery = {
  name: string;
  year?: number;
  age?: number;
};

// "Madonna at 15" → name + age, "Madonna 1990" → name + year,
// "1990" → year, "30" → age of the current person.
export function parseQuery(query: string): ParsedQuery {
  const yearMatch = query.match(/\b\d{4}\b/);
  const ageMatch = query.match(/\b\d{1,3}\b/);

  const name = query
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(at|in|aged?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name,
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    age: !yearMatch && ageMatch ? Number(ageMatch[0]) : undefined,
  };
}

// The same query with another name: "dario 33" → "Dario Amodei at 33".
export function queryWithName(query: string, name: string) {
  const { year, age } = parseQuery(query);

  if (year !== undefined) {
    return `${name} ${year}`;
  }

  if (age !== undefined) {
    return `${name} at ${age}`;
  }

  return name;
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Whether every word of the query starts a word of the name, in order
// ("mich jor" → Michael Jordan).
function wordsStart(words: string[], tokens: string[]) {
  let from = 0;

  for (const token of tokens) {
    const index = words.findIndex((word, at) => at >= from && word.startsWith(token));

    if (index === -1) {
      return false;
    }

    from = index + 1;
  }

  return true;
}

// How well a name matches: the whole name, then a whole word ("Picasso"),
// then the starts of words ("Pic", "mich jor"), then anything inside.
function scoreName(candidate: string, query: string, tokens: string[]) {
  const words = candidate.split(" ");

  if (candidate === query) {
    return 4;
  }

  if (words.includes(query) || candidate.startsWith(`${query} `)) {
    return 3;
  }

  if (wordsStart(words, tokens)) {
    return 2;
  }

  if (candidate.includes(query)) {
    return 1;
  }

  return 0;
}

// The people whose names match best, the better known first among equals.
export function rankPeopleByName(people: Person[], name: string, limit: number) {
  const query = normalize(name);

  if (!query) {
    return [];
  }

  const tokens = query.split(" ");
  const scored: { person: Person; score: number }[] = [];

  for (const person of people) {
    const score = scoreName(normalize(person.name), query, tokens);

    if (score > 0) {
      scored.push({ person, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || b.person.views - a.person.views)
    .slice(0, limit)
    .map((entry) => entry.person);
}

export function findPersonByName(people: Person[], name: string) {
  return rankPeopleByName(people, name, 1)[0];
}

export function resolveSearch(
  query: string,
  people: Person[],
  currentPerson: Person,
  currentYear: number
): SearchResult {
  const parsed = parseQuery(query);

  if (!parsed.name && parsed.year === undefined && parsed.age === undefined) {
    return { ok: false, message: "Type a name, a year, an age, or a mix" };
  }

  const person = parsed.name
    ? findPersonByName(people, parsed.name)
    : currentPerson;

  if (!person) {
    return { ok: false, message: `No “${parsed.name}” in the library yet` };
  }

  const year =
    parsed.year ??
    (parsed.age !== undefined ? person.birthYear + parsed.age : currentYear);

  if (year > currentYear) {
    return { ok: false, message: `${year} hasn’t happened yet` };
  }

  return { ok: true, person, year };
}
