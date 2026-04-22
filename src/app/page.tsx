"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import data from "@/data/mockData.json";

type Milestone = {
  year: number;
  text: string;
};

type Person = {
  id: string;
  name: string;
  category: string;
  birthYear: number;
  deathYear?: number;
  age?: number;
  year?: number;
  fact?: string;
  milestones: Milestone[];
  image: string;
};

function PersonImage({
  person,
  size,
}: {
  person: Pick<Person, "name" | "image">;
  size: number;
}) {
  return (
    <Image
      src={person.image}
      alt={person.name}
      width={size}
      height={size}
      className="rounded-full"
      priority={size > 80}
      unoptimized
    />
  );
}

function getFactForYear(milestones: Milestone[], targetYear: number) {
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

function findPersonByQuery(people: Person[], query: string) {
  const normalizedQuery = query.toLowerCase();
  const exactMatch = people.find((person) =>
    person.name.toLowerCase().includes(normalizedQuery)
  );

  if (exactMatch) {
    return exactMatch;
  }

  const queryWords = normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length >= 3);

  return people.find((person) => {
    const normalizedName = person.name.toLowerCase();

    return queryWords.some((word) => normalizedName.includes(word));
  });
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, value));
}

const TIMELINE_START_YEAR = 1900;

export default function Home() {
  const people = [data.main_person, ...data.contemporaries];
  const [mainPerson, setMainPerson] = useState<Person>(data.main_person);
  const [targetYear, setTargetYear] = useState(data.resolved.year);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const contemporaries = people.filter((person) => person.id !== mainPerson.id);
  const currentYear = new Date().getFullYear();
  const timelineSpan = currentYear - TIMELINE_START_YEAR;
  const selectedYearPosition = clampPercentage(
    ((targetYear - TIMELINE_START_YEAR) / timelineSpan) * 100
  );
  const lifelineStartPosition = clampPercentage(
    ((mainPerson.birthYear - TIMELINE_START_YEAR) / timelineSpan) * 100
  );
  const lifelineEndYear = mainPerson.deathYear ?? currentYear;
  const lifelineEndPosition = clampPercentage(
    ((lifelineEndYear - TIMELINE_START_YEAR) / timelineSpan) * 100
  );
  const lifelineWidth = Math.max(
    0,
    lifelineEndPosition - lifelineStartPosition
  );
  const isAlive = !mainPerson.deathYear;
  const timelineTicks = Array.from(
    { length: Math.floor((currentYear - TIMELINE_START_YEAR) / 10) + 1 },
    (_, index) => TIMELINE_START_YEAR + index * 10
  );

  function calculateAge(person: Person) {
    return targetYear - person.birthYear;
  }

  function selectPerson(person: Person) {
    setMainPerson(person);
    setMessage("");
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    const nextQuery = event.target.value;
    const yearMatch = nextQuery.match(/\b\d{4}\b/);

    setQuery(nextQuery);
    setMessage("");

    if (yearMatch) {
      setTargetYear(Number(yearMatch[0]));
    }
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const yearMatch = query.match(/\b\d{4}\b/);
    if (yearMatch) {
      setTargetYear(Number(yearMatch[0]));
    }

    const normalizedQuery = query
      .replace(/\b\d+\b/g, "")
      .trim()
      .toLowerCase();

    if (!normalizedQuery) {
      setMessage(yearMatch ? "" : "Person not found in local demo");
      return;
    }

    const match = findPersonByQuery(people, normalizedQuery);

    if (match) {
      selectPerson(match);
      return;
    }

    setMessage("Person not found in local demo");
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
          <form onSubmit={onSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={handleQueryChange}
              placeholder="Try Elon Musk"
              aria-label="Search by name"
            />
            <Button type="submit">Search</Button>
          </form>
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
        </div>

        <section>
          <div className="relative h-24">
            <div className="absolute left-0 right-0 top-10 h-3 rounded-full bg-slate-200" />
            {timelineTicks.map((year) => {
              const tickPosition = clampPercentage(
                ((year - TIMELINE_START_YEAR) / timelineSpan) * 100
              );

              return (
                <div
                  key={year}
                  className="absolute top-8 h-7 w-px bg-slate-300"
                  style={{ left: `${tickPosition}%` }}
                >
                  <span className="absolute top-7 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                    {year}
                  </span>
                </div>
              );
            })}
            <div
              className="absolute top-11 h-1 rounded-full bg-sky-300/70"
              style={{
                left: `${lifelineStartPosition}%`,
                width: `${lifelineWidth}%`,
                background: isAlive
                  ? "linear-gradient(to right, rgb(125 211 252 / 0.7) 75%, transparent)"
                  : undefined,
              }}
            />
            <div
              className="absolute top-4 h-12 w-0.5 bg-sky-600"
              style={{ left: `${selectedYearPosition}%` }}
            >
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-semibold text-sky-700">
                {targetYear}
              </span>
            </div>
            <div className="absolute right-0 top-6 h-10 w-px bg-muted-foreground/70">
              <span className="absolute -top-5 right-0 text-xs text-muted-foreground">
                {currentYear}
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Resolved year
            </p>
            <h1 className="text-6xl font-bold tracking-normal sm:text-8xl">
              {targetYear}
            </h1>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-6 pt-2 sm:flex-row sm:items-center">
              <PersonImage person={mainPerson} size={112} />

              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-4xl font-bold tracking-normal sm:text-5xl">
                    {mainPerson.name}
                  </h2>
                  <p className="mt-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                    Age {calculateAge(mainPerson)}
                  </p>
                </div>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  {getFactForYear(mainPerson.milestones, targetYear)}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-xl font-semibold tracking-normal">
            Also alive in {targetYear}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contemporaries.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => selectPerson(person)}
                className="text-left"
              >
                <Card size="sm" className="h-full">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <PersonImage person={person} size={64} />

                      <div className="min-w-0">
                        <CardTitle>{person.name}</CardTitle>
                        <CardDescription>
                          {person.category} · Age {calculateAge(person)}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {getFactForYear(person.milestones, targetYear)}
                    </p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
