export type Milestone = {
  year: number;
  text: string;
};

export type Person = {
  id: string;
  name: string;
  category: string;
  birthYear: number;
  deathYear?: number;
  milestones: Milestone[];
  image: string;
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

export function getFactForYear(milestones: Milestone[], targetYear: number) {
  const sortedMilestones = [...milestones].sort((a, b) => a.year - b.year);
  const firstMilestone = sortedMilestones[0];

  if (!firstMilestone) {
    return "";
  }

  return (
    sortedMilestones.findLast((milestone) => milestone.year <= targetYear) ??
    firstMilestone
  ).text;
}

export function findPersonByName(people: Person[], name: string) {
  const normalizedName = name.toLowerCase();
  const exactMatch = people.find((person) =>
    person.name.toLowerCase().includes(normalizedName)
  );

  if (exactMatch) {
    return exactMatch;
  }

  const nameWords = normalizedName
    .split(/\s+/)
    .filter((word) => word.length >= 3);

  return people.find((person) => {
    const personName = person.name.toLowerCase();

    return nameWords.some((word) => personName.includes(word));
  });
}
