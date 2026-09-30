export type Milestone = {
  year: number;
  text: string;
};

export type Portrait = {
  file: string;
  artist?: string;
  license?: string;
  licenseUrl?: string;
  // When the photo was taken, if Commons knows.
  year?: number;
};

export type EraPortrait = Portrait & { year: number };

export type Person = {
  id: string;
  name: string;
  description: string;
  birthYear: number;
  deathYear?: number;
  domain: string;
  country?: string;
  sitelinks: number;
  // English Wikipedia views over the last twelve months.
  views: number;
  wikipedia: string;
  portrait?: Portrait;
  // Dated portraits from Commons' "<Person> in <year>" categories.
  portraits?: EraPortrait[];
  milestones: Milestone[];
};

export function getAge(person: Person, year: number) {
  return year - person.birthYear;
}

export function isAliveIn(person: Person, year: number) {
  return (
    year >= person.birthYear &&
    year <= (person.deathYear ?? new Date().getFullYear())
  );
}

// The nearest year inside the person's lifetime.
export function clampToLife(person: Person, year: number, currentYear: number) {
  return Math.min(
    person.deathYear ?? currentYear,
    Math.max(person.birthYear, year)
  );
}

export function pluralYears(count: number) {
  return `${count} ${count === 1 ? "year" : "years"}`;
}

// The latest milestone up to that year; before the first one, or without
// any, an honest general line built from the age and the description.
export function getFactForYear(person: Person, year: number) {
  const latest = [...person.milestones]
    .sort((a, b) => a.year - b.year)
    .findLast((milestone) => milestone.year <= year);

  return latest ? latest.text : genericFact(person, year);
}

// Nothing invented: the stage of life from the age, and what the person is
// known for from Wikidata.
function genericFact(person: Person, year: number) {
  const age = getAge(person, year);
  const known = person.description;
  const withKnown = (stage: string, joiner: string) =>
    known ? `${stage} — ${joiner}${known}` : stage;

  if (person.deathYear === year) {
    return withKnown("Last year of life", "");
  }

  if (age <= 12) {
    return withKnown("A child", "later ");
  }

  if (age <= 17) {
    return withKnown("A teenager", "later ");
  }

  if (age <= 24) {
    return withKnown("Starting out", "");
  }

  return known;
}

// The portrait nearest to that year. An undated default portrait only
// gives way to a dated one from roughly the same era.
export function portraitFor(person: Person, year: number): Portrait | undefined {
  const dated: Portrait[] = [...(person.portraits ?? [])];

  if (person.portrait?.year !== undefined) {
    dated.push(person.portrait);
  }

  let nearest: Portrait | undefined;

  for (const candidate of dated) {
    if (
      !nearest ||
      Math.abs(candidate.year! - year) < Math.abs(nearest.year! - year)
    ) {
      nearest = candidate;
    }
  }

  if (!nearest) {
    return person.portrait;
  }

  if (person.portrait?.year === undefined && Math.abs(nearest.year! - year) > 8) {
    return person.portrait;
  }

  return nearest;
}

// "photo 2019" when the photo is clearly not from that year.
export function photoNote(portrait: Portrait | undefined, year: number) {
  if (portrait?.year === undefined || Math.abs(portrait.year - year) <= 1) {
    return "";
  }

  return `photo ${portrait.year}`;
}

// Widths Wikipedia itself requests (infobox 220px and its 1.5x / 2x), so the
// thumbnail usually already exists on Commons instead of being rendered on
// first view.
const THUMBNAIL_WIDTHS = [220, 330, 440, 660, 1024];

export function portraitUrl(portrait: Portrait, width: number) {
  const served =
    THUMBNAIL_WIDTHS.find((candidate) => candidate >= width) ??
    THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1];

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(portrait.file)}?width=${served}`;
}
