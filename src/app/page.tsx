import type { Metadata } from "next";
import { Atlas } from "@/components/atlas";
import { resolveView, timelineStartYear } from "@/lib/data";
import { getAge, isAliveIn } from "@/lib/people";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const view = resolveView(await searchParams);

  if (!view) {
    return { title: "Age Atlas" };
  }

  const { subject, year } = view;
  const who = isAliveIn(subject, year)
    ? `${subject.name}, ${getAge(subject, year)} in ${year}`
    : `${subject.name} in ${year}`;

  return { title: `${who} — Age Atlas` };
}

export default async function Page({ searchParams }: PageProps) {
  const view = resolveView(await searchParams);

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-16 sm:px-8">
        <p className="text-sm font-semibold tracking-[0.18em] uppercase">
          Age Atlas
        </p>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          The library is empty. Run <code>npm run data:people</code> to build it
          from Wikidata, then <code>npm run data:milestones</code> for the
          timelines.
        </p>
      </main>
    );
  }

  return (
    <Atlas
      key={`${view.subject.id}:${view.year}:${view.seed}`}
      subject={view.subject}
      year={view.year}
      people={[view.subject, ...view.contemporaries]}
      seed={view.seed}
      query={view.query}
      message={view.message}
      examples={view.examples}
      startYear={timelineStartYear}
      currentYear={new Date().getFullYear()}
    />
  );
}
