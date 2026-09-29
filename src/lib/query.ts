import { findPersonByName, isAliveIn, type Person } from "@/lib/people";

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
    return { ok: false, message: `No “${parsed.name}” in the demo data yet` };
  }

  const year =
    parsed.year ??
    (parsed.age !== undefined ? person.birthYear + parsed.age : currentYear);

  if (!isAliveIn(person, year)) {
    return { ok: false, message: describeOutOfLifespan(person, year) };
  }

  return { ok: true, person, year };
}

function describeOutOfLifespan(person: Person, year: number) {
  if (year > new Date().getFullYear()) {
    return `${year} hasn’t happened yet`;
  }

  if (year < person.birthYear) {
    return `${person.name} wasn’t born yet in ${year} (born ${person.birthYear})`;
  }

  return `${person.name} was no longer alive in ${year} (${person.birthYear}–${person.deathYear})`;
}
