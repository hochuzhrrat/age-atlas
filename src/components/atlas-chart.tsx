"use client";

import Image from "next/image";
import { Slider } from "@/components/ui/slider";
import {
  getAge,
  getFactForYear,
  isAliveIn,
  photoNote,
  pluralYears,
  portraitFor,
  portraitUrl,
  type Person,
  type Portrait,
} from "@/lib/people";
import { cn } from "@/lib/utils";

// One shared grid for the axis, group heading and rows, so the year rule
// drawn in the third column lines up from top to bottom.
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 md:grid-cols-[minmax(0,17rem)_3.5rem_minmax(0,1fr)_minmax(0,16rem)] md:gap-x-8";
const LABEL =
  "font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase";

type AtlasChartProps = {
  people: Person[];
  subject: Person;
  year: number;
  startYear: number;
  endYear: number;
  pending?: boolean;
  onYearChange: (year: number) => void;
  onYearCommit: (year: number) => void;
  onSelect: (person: Person) => void;
  onShuffle: () => void;
};

export function AtlasChart({
  people,
  subject,
  year,
  startYear,
  endYear,
  pending = false,
  onYearChange,
  onYearCommit,
  onSelect,
  onShuffle,
}: AtlasChartProps) {
  const span = endYear - startYear;
  const toPercent = (value: number) =>
    Math.min(100, Math.max(0, ((value - startYear) / span) * 100));
  const yearPosition = toPercent(year);
  const subjectStart = toPercent(subject.birthYear);
  const subjectEnd = toPercent(subject.deathYear ?? endYear);

  // Everyone the server picked for the committed year, oldest first: the top
  // of the chart is near the end of life, the bottom has just started. While
  // the rule is dragged, people outside their lifetime fade rather than
  // vanish; releasing it fetches a fresh six for the new year.
  const rows = [...people].sort((a, b) => a.birthYear - b.birthYear);
  const aliveCount = rows.filter((person) => isAliveIn(person, year)).length;

  const firstTick = Math.ceil(startYear / 20) * 20;
  const ticks = Array.from(
    { length: Math.floor((endYear - firstTick) / 20) + 1 },
    (_, index) => firstTick + index * 20
  );

  const toYear = (value: number | readonly number[]) =>
    Array.isArray(value) ? value[0] : (value as number);

  return (
    <section
      aria-busy={pending}
      className={cn("flex flex-col transition-opacity", pending && "opacity-60")}
    >
      <div className={cn(GRID, "items-end border-b border-foreground pb-2")}>
        <span className={LABEL}>Oldest first</span>
        <span className={cn(LABEL, "text-right md:text-left")}>Age</span>

        <div className="relative col-span-2 pt-12 md:col-span-1">
          <span
            className="absolute top-0 -translate-x-1/2 bg-signal px-1.5 py-0.5 font-mono text-[11px] text-background tabular-nums"
            style={{
              left: `clamp(1.25rem, ${yearPosition}%, calc(100% - 1.25rem))`,
            }}
          >
            {year}
          </span>

          {/* The subject's lifetime, marked on the axis itself. The labels
              sit at the ends of the segment, or side by side when it is
              too short for both. */}
          <span
            className="absolute top-6 flex min-w-max justify-between gap-3 font-mono text-[11px] whitespace-nowrap tabular-nums"
            style={{
              left: `${subjectStart}%`,
              width: `${subjectEnd - subjectStart}%`,
            }}
          >
            <span>Born {subject.birthYear}</span>
            <span>{subject.deathYear ? `Died ${subject.deathYear}` : "Today"}</span>
          </span>

          <div className="relative">
            <Slider
              value={[year]}
              min={startYear}
              max={endYear}
              onValueChange={(value) => onYearChange(toYear(value))}
              onValueCommitted={(value) => onYearCommit(toYear(value))}
              aria-label="Year"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-[3px] -translate-y-1/2 bg-foreground"
              style={{
                left: `${subjectStart}%`,
                width: `${subjectEnd - subjectStart}%`,
              }}
            />
          </div>

          <div className="relative h-4 font-mono text-[11px] text-muted-foreground tabular-nums">
            {ticks.map((tick) => (
              <span
                key={tick}
                className={cn(
                  "absolute -translate-x-1/2",
                  tick % 40 !== 0 && "hidden lg:inline"
                )}
                style={{ left: `${toPercent(tick)}%` }}
              >
                {tick}
              </span>
            ))}
          </div>
        </div>

        <span className={cn(LABEL, "hidden md:block")}>In {year}</span>
      </div>

      <div className={cn(GRID, "items-center border-b border-border")}>
        <h2 className="py-3 text-sm font-medium md:col-span-2">
          Alive in {year}
          <span className="ml-3 text-muted-foreground tabular-nums">
            {aliveCount}
          </span>
        </h2>
        <span className="relative hidden self-stretch md:block">
          <YearRule position={yearPosition} />
        </span>
        <button
          type="button"
          onClick={onShuffle}
          className={cn(
            LABEL,
            "justify-self-end py-3 text-foreground underline decoration-1 underline-offset-4 hover:text-signal md:justify-self-start"
          )}
        >
          Shuffle
        </button>
      </div>

      <ol>
        {rows.map((person) => (
          <Row
            key={person.id}
            person={person}
            isSubject={person.id === subject.id}
            year={year}
            endYear={endYear}
            toPercent={toPercent}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </section>
  );
}

function YearRule({ position }: { position: number }) {
  return (
    <span
      aria-hidden
      className="absolute top-0 -bottom-px w-px bg-signal"
      style={{ left: `${position}%` }}
    />
  );
}

export function PortraitImage({
  portrait,
  alt,
  width,
  height,
  className,
  priority = false,
}: {
  portrait: Portrait | undefined;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  if (!portrait) {
    return (
      <span
        aria-hidden
        className={cn("block shrink-0 bg-surface", className)}
        style={{ width, height }}
      />
    );
  }

  return (
    <Image
      key={portrait.file}
      src={portraitUrl(portrait, width * 3)}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      // Seven portraits per page are the content, not below-the-fold extras.
      {...(priority ? { priority: true } : { loading: "eager" as const })}
      className={cn("shrink-0 bg-surface object-cover", className)}
      style={{ width, height }}
    />
  );
}

function Row({
  person,
  isSubject,
  year,
  endYear,
  toPercent,
  onSelect,
}: {
  person: Person;
  isSubject: boolean;
  year: number;
  endYear: number;
  toPercent: (value: number) => number;
  onSelect: (person: Person) => void;
}) {
  const alive = isAliveIn(person, year);
  const barStart = toPercent(person.birthYear);
  const barWidth = toPercent(person.deathYear ?? endYear) - barStart;
  const portrait = portraitFor(person, year);
  const note = photoNote(portrait, year);

  return (
    <li
      className={cn(
        "border-b border-border transition-opacity",
        !alive && "opacity-35"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(person)}
        aria-current={isSubject ? "true" : undefined}
        className={cn(
          GRID,
          "group w-full items-stretch py-3 text-left outline-none transition-colors hover:bg-surface focus-visible:bg-surface md:py-0",
          isSubject && "bg-surface"
        )}
      >
        <span className="flex items-center gap-3 md:py-3">
          <PortraitImage portrait={portrait} alt={person.name} width={40} height={52} />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-xl leading-none font-medium tracking-tight decoration-1 underline-offset-4 group-hover:underline">
              {person.name}
            </span>
            <span className="flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground tabular-nums">
              <span>{person.domain}</span>
              <span>
                {person.birthYear}–{person.deathYear ?? ""}
              </span>
              {note ? <span>{note}</span> : null}
            </span>
          </span>
        </span>

        <span className="self-center text-right text-xl font-medium tabular-nums md:py-3 md:text-left">
          {alive ? getAge(person, year) : "—"}
        </span>

        {/* On a phone the row reads top to bottom — who, how old, what they
            were doing — and the lifespan bar closes it, so the year rule
            still runs through every row. */}
        <span className="relative order-4 col-span-2 mt-2 block h-6 md:order-none md:col-span-1 md:mt-0 md:h-auto">
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px bg-border"
          />
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 h-1.5 -translate-y-1/2",
              isSubject ? "bg-foreground" : "bg-bar"
            )}
            style={{ left: `${barStart}%`, width: `${barWidth}%` }}
          />
          <YearRule position={toPercent(year)} />
          {alive ? (
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal ring-2 ring-background",
                isSubject ? "size-3" : "size-2"
              )}
              style={{ left: `${toPercent(year)}%` }}
            />
          ) : null}
        </span>

        <span className="order-3 col-span-2 mt-2 line-clamp-2 text-sm leading-6 md:order-none md:col-span-1 md:mt-0 md:self-center md:py-3">
          {alive ? getFactForYear(person, year) : describeAbsence(person, year)}
        </span>
      </button>
    </li>
  );
}

function describeAbsence(person: Person, year: number) {
  if (person.birthYear > year) {
    return `Born ${pluralYears(person.birthYear - year)} later`;
  }

  return `Died ${pluralYears(year - (person.deathYear ?? year))} earlier`;
}
