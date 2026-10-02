"use client";

import {
  FocusEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { ArrowRightIcon } from "lucide-react";
import { AtlasChart, PortraitImage } from "@/components/atlas-chart";
import { Button } from "@/components/ui/button";
import {
  clampToLife,
  getAge,
  getFactForYear,
  isAliveIn,
  photoNote,
  pluralYears,
  portraitFor,
  type Person,
  type Suggestion,
} from "@/lib/people";
import { parseQuery, queryWithName } from "@/lib/query";
import { cn } from "@/lib/utils";

const LABEL =
  "font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase";

// Names are suggested once this much of one is typed; with a little more,
// an empty result is worth saying out loud.
const SUGGEST_FROM = 2;
const EMPTY_FROM = 3;

type AtlasProps = {
  subject: Person;
  year: number;
  // The subject and their contemporaries, all with milestones.
  people: Person[];
  seed: number;
  query: string;
  message: string;
  examples: string[];
  startYear: number;
  currentYear: number;
};

export function Atlas({
  subject,
  year: initialYear,
  people,
  seed,
  query: initialQuery,
  message,
  examples,
  startYear,
  currentYear,
}: AtlasProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [year, setYear] = useState(initialYear);
  // Like an address bar, the field always holds a query that reproduces the
  // current view, so the syntax is learnt by example and "at 41" → "at 60"
  // is one edit away. The user's own wording wins when they typed one.
  const [query, setQuery] = useState(
    initialQuery || queryFor(subject, initialYear)
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Name suggestions for what has been typed since the page loaded; the
  // mirrored query itself never asks for any.
  const [typed, setTyped] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestedFor, setSuggestedFor] = useState("");
  const [open, setOpen] = useState(false);
  const subjectAlive = isAliveIn(subject, year);
  const subjectPortrait = portraitFor(subject, year);
  const subjectNote = photoNote(subjectPortrait, year);

  // "/" jumps to the search field from anywhere on the page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;

      if (event.key === "/" && !target?.closest("input, textarea, [contenteditable]")) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!typed) {
      return;
    }

    const { name } = parseQuery(query);

    if (name.length < SUGGEST_FROM) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const found: Suggestion[] = await response.json();

        setSuggestions(found);
        setSuggestedFor(query);
        setOpen(found.length > 0 || name.length >= EMPTY_FROM);
      } catch {
        // Aborted by further typing, or offline: keep what is shown.
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, typed]);

  // Everything the page shows lives in the URL, so every view has a link.
  function navigate(params: Record<string, string | number>, replace = false) {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      search.set(key, String(value));
    }

    startTransition(() => {
      const href = `/?${search}`;

      if (replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    });
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (query.trim()) {
      navigate({ q: query.trim() });
    }
  }

  function onExample(example: string) {
    setQuery(example);
    navigate({ q: example });
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setTyped(true);

    if (parseQuery(value).name.length < SUGGEST_FROM) {
      setSuggestions([]);
      setOpen(false);
    }
  }

  // A suggested name takes the place of the typed one; the year or age
  // typed with it stays ("dario 33" → "Dario Amodei at 33").
  function pickSuggestion(person: Suggestion) {
    const next = queryWithName(suggestedFor || query, person.name);

    setOpen(false);
    setQuery(next);
    navigate({ q: next });
  }

  // Typing replaces the mirrored query instead of appending to it.
  function handleQueryFocus(event: FocusEvent<HTMLInputElement>) {
    event.currentTarget.select();
  }

  function onYearCommit(committedYear: number) {
    if (committedYear !== initialYear) {
      navigate({ p: subject.id, y: committedYear, s: seed }, true);
    }
  }

  const lifespan = subject.deathYear
    ? `${subject.birthYear}–${subject.deathYear}`
    : `Born ${subject.birthYear}`;

  // Credits for the portraits actually on screen for this year.
  const credited = people.flatMap((person) => {
    const portrait = portraitFor(person, year);
    return portrait ? [{ person, portrait }] : [];
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-8">
      <header className="grid gap-6 border-b border-foreground pb-6 md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:items-start">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] uppercase">
            Age Atlas
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A person, a moment — and everyone else alive at the time.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <form ref={formRef} onSubmit={onSearch} className="flex">
            <Autocomplete.Root
              items={suggestions}
              // The server already chose the six; nothing to filter here.
              filter={null}
              mode="none"
              value={query}
              onValueChange={handleQueryChange}
              open={open}
              onOpenChange={setOpen}
              inputRef={inputRef}
              itemToStringValue={(person: Suggestion) => person.name}
            >
              <Autocomplete.Input
                onFocus={handleQueryFocus}
                placeholder="Name, age or year"
                aria-label="Search by name, year, or age"
                className="h-12 w-full min-w-0 rounded-none border border-hairline-strong bg-transparent px-4 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-foreground"
              />
              <Autocomplete.Portal>
                <Autocomplete.Positioner
                  anchor={formRef}
                  align="start"
                  sideOffset={-1}
                  className="z-50 outline-none"
                >
                  {/* Continues the box of the field: same border, no radius,
                      one hairline between rows. */}
                  <Autocomplete.Popup className="w-(--anchor-width) border border-hairline-strong bg-background shadow-[0_16px_40px_-24px_rgba(0,0,0,0.4)] outline-none">
                    <Autocomplete.Empty className="px-4 py-3 text-sm text-muted-foreground">
                      No one by that name in the library yet
                    </Autocomplete.Empty>
                    <Autocomplete.List>
                      {(person: Suggestion) => (
                        <Autocomplete.Item
                          key={person.id}
                          value={person}
                          onClick={() => pickSuggestion(person)}
                          className="flex cursor-default items-baseline justify-between gap-4 border-t border-border px-4 py-2.5 text-base first:border-t-0 data-highlighted:bg-surface"
                        >
                          <span className="truncate">{person.name}</span>
                          <span className={cn(LABEL, "flex shrink-0 gap-x-3 tabular-nums")}>
                            <span>{person.domain}</span>
                            <span>
                              {person.birthYear}–{person.deathYear ?? ""}
                            </span>
                          </span>
                        </Autocomplete.Item>
                      )}
                    </Autocomplete.List>
                  </Autocomplete.Popup>
                </Autocomplete.Positioner>
              </Autocomplete.Portal>
            </Autocomplete.Root>
            <Button
              type="submit"
              aria-label="Search"
              className="size-12 shrink-0 rounded-none [&_svg]:size-5"
            >
              <ArrowRightIcon />
            </Button>
          </form>
          <p role="status" className="min-h-5 text-sm">
            {message ? (
              <span className="text-destructive">{message}</span>
            ) : (
              <span className="flex flex-wrap gap-x-4 text-muted-foreground">
                <span>Try</span>
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => onExample(example)}
                    className="underline decoration-1 underline-offset-4 hover:text-foreground"
                  >
                    {example}
                  </button>
                ))}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Bottom edges line up: the portrait, the last line of the fact and
          the figures. text-box-trim drops the empty space under the glyphs
          so a box's bottom is its baseline. */}
      <section className="grid gap-6 py-10 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end md:gap-10 md:py-14">
        <PortraitImage
          portrait={subjectPortrait}
          alt={subject.name}
          width={128}
          height={160}
          priority
          className="md:h-[200px] md:w-[160px]"
        />

        <div>
          <p className={cn(LABEL, "flex flex-wrap gap-x-4")}>
            <span>{subject.domain}</span>
            <span>{lifespan}</span>
            {subject.country ? <span>{subject.country}</span> : null}
            {subjectNote ? <span>{subjectNote}</span> : null}
          </p>
          <h1 className="mt-3 text-[clamp(2.5rem,6vw,4.25rem)] leading-[0.95] font-semibold tracking-[-0.03em]">
            {subject.name}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground [text-box-edge:cap_alphabetic] [text-box-trim:trim-end]">
            {subjectAlive
              ? getFactForYear(subject, year)
              : describeSubjectAbsence(subject, year)}
          </p>
        </div>

        <dl className="flex gap-10 md:gap-14">
          <div>
            <dt className={LABEL}>Age</dt>
            <dd
              className={cn(
                "mt-2 text-5xl leading-none font-medium tracking-[-0.02em] tabular-nums [text-box-edge:cap_alphabetic] [text-box-trim:trim-end] md:text-6xl",
                !subjectAlive && "text-muted-foreground"
              )}
            >
              {subjectAlive ? getAge(subject, year) : "—"}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Year</dt>
            <dd className="mt-2 text-5xl leading-none font-medium tracking-[-0.02em] tabular-nums [text-box-edge:cap_alphabetic] [text-box-trim:trim-end] md:text-6xl">
              {year}
            </dd>
          </div>
        </dl>
      </section>

      <AtlasChart
        people={people}
        subject={subject}
        year={year}
        startYear={startYear}
        endYear={currentYear}
        pending={isPending}
        onYearChange={setYear}
        onYearCommit={onYearCommit}
        onSelect={(person) =>
          navigate({ p: person.id, y: clampToLife(person, year, currentYear) })
        }
        onShuffle={() => navigate({ p: subject.id, y: year, s: seed + 1 }, true)}
      />

      <footer className="mt-12 flex flex-col gap-3 font-mono text-[11px] text-muted-foreground">
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-2">
          <span>
            Drag the rule, click a name, or shuffle. Search accepts a name, a
            year, or an age.
          </span>
          <span>
            Data from Wikidata and Wikipedia, portraits from Wikimedia Commons
          </span>
        </div>
        {credited.length > 0 ? (
          <details>
            <summary className="cursor-pointer select-none">
              Portrait credits
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {credited.map(({ person, portrait }) => (
                <li key={person.id}>
                  <a
                    href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(portrait.file)}`}
                    className="underline decoration-1 underline-offset-2 hover:text-foreground"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {person.name}
                  </a>
                  {portrait.year ? ` (${portrait.year})` : ""}
                  {" — "}
                  {portrait.artist || "author not listed"}
                  {portrait.license ? `, ${portrait.license}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </footer>
    </main>
  );
}

function queryFor(person: Person, year: number) {
  return isAliveIn(person, year)
    ? `${person.name} at ${getAge(person, year)}`
    : `${person.name} ${year}`;
}

// Long form for the subject block: the short row wording would read oddly
// next to the eyebrow that already says "Born 1958".
function describeSubjectAbsence(person: Person, year: number) {
  if (person.birthYear > year) {
    return `Not yet born — ${pluralYears(person.birthYear - year)} before birth`;
  }

  return `Died in ${person.deathYear}, ${pluralYears(year - (person.deathYear ?? year))} earlier`;
}
