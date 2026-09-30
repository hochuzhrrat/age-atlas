import type { Person } from "@/lib/people";

export type SearchResult =
  | { ok: true; person: Person; year: number }
  | { ok: false; message: string };

type ParsedQuery = {
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

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Best match wins: the whole name, then a whole word ("Picasso"), then the
// start of a word ("Pic"), then anything inside; ties go to the better known.
export function findPersonByName(people: Person[], name: string) {
  const query = normalize(name);

  if (!query) {
    return undefined;
  }

  let best: { person: Person; score: number } | undefined;

  for (const person of people) {
    const candidate = normalize(person.name);
    const words = candidate.split(" ");
    let score = 0;

    if (candidate === query) {
      score = 4;
    } else if (words.includes(query) || candidate.startsWith(`${query} `)) {
      score = 3;
    } else if (words.some((word) => word.startsWith(query))) {
      score = 2;
    } else if (candidate.includes(query)) {
      score = 1;
    }

    if (
      score > 0 &&
      (!best ||
        score > best.score ||
        (score === best.score && person.views > best.person.views))
    ) {
      best = { person, score };
    }
  }

  return best?.person;
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
