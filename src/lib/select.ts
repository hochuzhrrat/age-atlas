import { getAge, isAliveIn, type Person } from "@/lib/people";

// Life stages: one person from each, so a query always lands next to a
// child, someone starting out, people at their peak, and someone near the
// end. Six stages, six contemporaries.
const AGE_BUCKETS: ReadonlyArray<readonly [number, number]> = [
  [0, 14],
  [15, 29],
  [30, 45],
  [46, 60],
  [61, 75],
  [76, 130],
];

// Each seat is drawn from the most looked-up people of its life stage, so
// the six are names a visitor knows; the draw keeps Shuffle interesting.
const FAMOUS_PER_STAGE = 12;

// Two singers or two actors are fine; six is a wall of one thing.
const MAX_PER_DOMAIN = 2;

// Politics, business, science and the like get at most two of the six seats
// between them; the rest go to music, screen, sport and fashion.
const MASS_MEDIA = new Set(["Music", "Film & TV", "Sport", "Fashion"]);
const MAX_SERIOUS = 2;

// The atlas is about mass culture: a singer and a footballer count in full,
// a politician or a writer only when millions look them up anyway, a general
// almost never.
const DOMAIN_WEIGHT: Record<string, number> = {
  Music: 1,
  "Film & TV": 1,
  Sport: 0.8,
  Fashion: 0.8,
  Business: 0.6,
  Politics: 0.4,
  Literature: 0.4,
  "Art & Design": 0.4,
  Science: 0.3,
  Military: 0.15,
  Religion: 0.15,
  Other: 0.3,
};

export function fameOf(person: Person) {
  return person.views * (DOMAIN_WEIGHT[person.domain] ?? 0.3);
}

// FNV-1a: a stable 32-bit hash so the same query gives the same people.
export function hashString(input: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

// mulberry32: small seeded generator, plenty for shuffling people.
export function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }

  return result;
}

export function byFame(a: Person, b: Person) {
  return fameOf(b) - fameOf(a) || b.sitelinks - a.sitelinks;
}

// Among the most famous of a group, the better known are likelier, but on a
// square root so the top name does not take the seat every time.
function famousPick(candidates: Person[], random: () => number) {
  const top = [...candidates].sort(byFame).slice(0, FAMOUS_PER_STAGE);

  if (top.length === 0) {
    return null;
  }

  const weights = top.map((person) => Math.sqrt(fameOf(person) + 1));
  let remaining = random() * weights.reduce((sum, weight) => sum + weight, 0);

  for (let index = 0; index < top.length; index++) {
    remaining -= weights[index];

    if (remaining <= 0) {
      return top[index];
    }
  }

  return top[top.length - 1];
}

export function pickContemporaries(
  people: Person[],
  subject: Person,
  year: number,
  seed: string,
  count = 6
) {
  const random = createRandom(hashString(seed));
  const candidates = people
    .filter((person) => person.id !== subject.id && isAliveIn(person, year))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const chosen: Person[] = [];
  const taken = new Set<string>();
  const perDomain = new Map<string, number>();
  let serious = 0;

  const roomFor = (person: Person) =>
    (perDomain.get(person.domain) ?? 0) < MAX_PER_DOMAIN &&
    (MASS_MEDIA.has(person.domain) || serious < MAX_SERIOUS);
  const notSubjectDomain = (person: Person) => person.domain !== subject.domain;

  function take(person: Person | null) {
    if (person) {
      chosen.push(person);
      taken.add(person.id);
      perDomain.set(person.domain, (perDomain.get(person.domain) ?? 0) + 1);

      if (!MASS_MEDIA.has(person.domain)) {
        serious += 1;
      }
    }
  }

  // Three passes per seat: outside the subject's domain with room to spare,
  // then any domain with room, then anyone left in that stage.
  function pickFrom(pool: Person[]) {
    return (
      famousPick(pool.filter((person) => roomFor(person) && notSubjectDomain(person)), random) ??
      famousPick(pool.filter(roomFor), random) ??
      famousPick(pool, random)
    );
  }

  for (const [minAge, maxAge] of shuffle(AGE_BUCKETS, random)) {
    if (chosen.length >= count) {
      break;
    }

    take(
      pickFrom(
        candidates.filter((person) => {
          const age = getAge(person, year);
          return !taken.has(person.id) && age >= minAge && age <= maxAge;
        })
      )
    );
  }

  // Fill the remaining seats when some life stages were empty.
  while (chosen.length < count) {
    const pick = pickFrom(candidates.filter((person) => !taken.has(person.id)));

    if (!pick) {
      break;
    }

    take(pick);
  }

  return chosen;
}
