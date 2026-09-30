import peopleFile from "@/data/people.json";
import milestonesFile from "@/data/milestones.json";
import portraitsFile from "@/data/portraits.json";
import { clampToLife, type EraPortrait, type Milestone, type Person } from "@/lib/people";
import { resolveSearch } from "@/lib/query";
import { byFame, createRandom, hashString, pickContemporaries } from "@/lib/select";

// Server-side only: people.json and milestones.json are a few megabytes and
// never reach the browser as a whole.

type PersonRecord = Omit<Person, "milestones" | "portraits">;

const milestonesById = milestonesFile as Record<string, Milestone[]>;
const portraitsById = portraitsFile as unknown as Record<string, EraPortrait[]>;

export const people: Person[] = (
  peopleFile as unknown as { people: PersonRecord[] }
).people.map((record) => ({
  ...record,
  milestones: milestonesById[record.id] ?? [],
  ...(portraitsById[record.id] ? { portraits: portraitsById[record.id] } : {}),
}));

// The axis starts here whatever the library's earliest birth year: people
// born before it are already adults in the first selectable year.
export const timelineStartYear = 1850;

export type AtlasView = {
  subject: Person;
  year: number;
  contemporaries: Person[];
  seed: number;
  query: string;
  message: string;
  // Three suggested queries under the search box, new on every view.
  examples: string[];
};

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const EXAMPLE_DOMAINS = ["Music", "Film & TV", "Sport"];

// Without a query, a star of music, screen or sport at a memorable age,
// changing daily.
function dailyDefault(currentYear: number) {
  const random = createRandom(hashString(new Date().toISOString().slice(0, 10)));
  const pool = people
    .filter((person) => EXAMPLE_DOMAINS.includes(person.domain))
    .sort(byFame)
    .slice(0, 150);
  const person = pool[Math.floor(random() * pool.length)];
  const age = 18 + Math.floor(random() * 30);

  return { person, year: clampToLife(person, person.birthYear + age, currentYear) };
}

// Three suggestions, new on every view: a musician, a screen star and an
// athlete, in a random order, each at a memorable age and in a different
// decade, written both ways ("at 23" and "1994") so the syntax is shown
// rather than explained.
function freshExamples(currentYear: number, exclude: Person) {
  const domains = [...EXAMPLE_DOMAINS];

  for (let index = domains.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [domains[index], domains[other]] = [domains[other], domains[index]];
  }

  const usedDecades = new Set<number>();
  const examples: string[] = [];

  for (const domain of domains) {
    const pool = people
      .filter((person) => person.domain === domain && person.id !== exclude.id)
      .sort(byFame)
      .slice(0, 40);

    for (let attempt = 0; attempt < 8 && pool.length > 0; attempt++) {
      const person = pool[Math.floor(Math.random() * pool.length)];
      const age = 16 + Math.floor(Math.random() * 30);
      const year = clampToLife(person, person.birthYear + age, currentYear);
      const decade = Math.floor(year / 10);

      if (usedDecades.has(decade) && attempt < 7) {
        continue;
      }

      usedDecades.add(decade);
      examples.push(
        examples.length % 2 === 0
          ? `${person.name} at ${year - person.birthYear}`
          : `${person.name} ${year}`
      );
      break;
    }
  }

  return examples;
}

// Resolves the URL into what the page shows. `p` + `y` come from clicks and
// the slider, `q` from the search box, `s` from Shuffle.
export function resolveView(params: Params): AtlasView | null {
  if (people.length === 0) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const query = first(params, "q") ?? "";
  const personId = first(params, "p");
  const seed = Math.max(0, Math.floor(Number(first(params, "s")) || 0));
  const fallback = dailyDefault(currentYear);
  let subject = fallback.person;
  let year = fallback.year;
  let message = "";

  const byId = personId ? people.find((person) => person.id === personId) : undefined;

  if (byId) {
    // The year comes from the rule or a click and is kept as is: the rule
    // may stand outside the subject's lifetime, the page then says so.
    subject = byId;
    year = Math.min(
      currentYear,
      Math.max(timelineStartYear, Number(first(params, "y")) || byId.birthYear + 30)
    );
  } else if (query) {
    const result = resolveSearch(query, people, fallback.person, currentYear);

    if (result.ok) {
      subject = result.person;
      year = result.year;
    } else {
      message = result.message;
    }
  }

  const contemporaries = pickContemporaries(
    people,
    subject,
    year,
    `${subject.id}|${year}|${seed}`
  );

  return {
    subject,
    year,
    contemporaries,
    seed,
    query,
    message,
    examples: freshExamples(currentYear, subject),
  };
}
