#!/usr/bin/env node
// Extracts dated milestones for the people in src/data/people.json from their
// English Wikipedia articles with Claude, through the Message Batches API
// (asynchronous, half the price of live requests). Writes
// src/data/milestones.json as { [personId]: [{ year, text }, ...] }.
//
//   node --env-file-if-exists=.env.local scripts/extract-milestones.mjs
//
// Resumable: article text is cached in scripts/.cache/wiki, submitted batches
// are remembered in scripts/.cache/batches.json and collected on the next run,
// and people who already have milestones are skipped. Env vars:
//   ANTHROPIC_API_KEY   required (an `ant auth login` profile also works)
//   TOP=200             only the N most notable people still missing milestones
//   MODEL=claude-opus-5 any current Claude model id
//   BATCH_SIZE=500      requests per batch

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const CACHE_DIR = path.join(ROOT, "scripts", ".cache");
const WIKI_CACHE_DIR = path.join(CACHE_DIR, "wiki");
const BATCHES_FILE = path.join(CACHE_DIR, "batches.json");
const PEOPLE_FILE = path.join(ROOT, "src", "data", "people.json");
const OUT_FILE = path.join(ROOT, "src", "data", "milestones.json");

const USER_AGENT = "AgeAtlas/0.1 (https://github.com/hochuzhrrat/age-atlas)";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

const TOP = Number(process.env.TOP ?? 0);
const MODEL = process.env.MODEL ?? "claude-opus-5";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 500);
const CURRENT_YEAR = new Date().getFullYear();

const Milestones = z.object({
  milestones: z.array(
    z.object({
      year: z.number().int(),
      text: z.string(),
    })
  ),
});

const SYSTEM = `You extract a timeline from an English Wikipedia biography for Age Atlas, a site that shows what a person was doing at a given age, next to other people who were alive at the same time.

Return 8 to 12 milestones spread across the whole life: birth, childhood or education, first job or early career, the breakthrough, the peak years, later life, and death if the article covers it. Prefer moments that are striking next to strangers of other ages: a first job, a move to a new city, a famous work, a fall, a comeback, a retirement.

Rules for each milestone:
- year: a four-digit year the article supports, between the birth year and the death year or the present. At most one milestone per year.
- text: one line in English, at most 80 characters, no trailing period. Write it as what was happening then: a gerund phrase such as "Founding Zip2 with his brother Kimbal" or "Painting Guernica", or a plain statement such as "Born in Bay City, Michigan". Name the specific works, places and people the article names. Do not put dates in the text.
- The first milestone is the birth, as "Born in <place>" when the article gives a place.
- Use only the article. If it is thin, return fewer milestones rather than inventing any.`;

// Reference and navigation sections carry no biography; everything before
// the first of these headings is kept in full.
const TRAILING_SECTIONS =
  /^(References|Notes|See also|External links|Bibliography|Further reading|Sources|Citations|Footnotes|Works cited)\s*$/m;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchArticle(person) {
  const cacheFile = path.join(WIKI_CACHE_DIR, `${person.id}.txt`);

  try {
    return await readFile(cacheFile, "utf8");
  } catch {
    // not cached yet
  }

  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "plain",
    redirects: "1",
    titles: person.wikipedia,
    format: "json",
    formatversion: "2",
  });
  const response = await fetch(`${WIKIPEDIA_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Wikipedia ${person.wikipedia}: HTTP ${response.status}`);
  }

  const extract = (await response.json()).query?.pages?.[0]?.extract ?? "";
  const cut = extract.search(TRAILING_SECTIONS);
  const text = (cut === -1 ? extract : extract.slice(0, cut)).trim();

  await writeFile(cacheFile, text);
  await sleep(200);

  return text;
}

function requestFor(person, article) {
  const life = person.deathYear
    ? `born ${person.birthYear}, died ${person.deathYear}`
    : `born ${person.birthYear}`;

  return {
    custom_id: person.id,
    params: {
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Person: ${person.name} (${person.description || person.domain}; ${life}).\n\nArticle:\n${article}`,
        },
      ],
      output_config: {
        // Haiku 4.5 does not take an effort setting.
        ...(MODEL.includes("haiku") ? {} : { effort: "medium" }),
        format: zodOutputFormat(Milestones),
      },
    },
  };
}

// Sorts, keeps one milestone per year, clamps to the lifetime and trims text.
function normalise(person, milestones) {
  const lastYear = person.deathYear ?? CURRENT_YEAR;
  const byYear = new Map();

  for (const milestone of milestones) {
    const year = Math.round(milestone.year);
    const text = milestone.text.trim().replace(/\.$/, "");

    if (year >= person.birthYear && year <= lastYear && text && !byYear.has(year)) {
      byYear.set(year, text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text);
    }
  }

  return [...byYear]
    .sort((a, b) => a[0] - b[0])
    .map(([year, text]) => ({ year, text }));
}

async function collectBatch(client, batchId, peopleById, milestones) {
  let batch = await client.messages.batches.retrieve(batchId);

  while (batch.processing_status !== "ended") {
    const counts = batch.request_counts;
    console.log(`  ${batchId}: ${batch.processing_status}, ${counts.processing} processing, ${counts.succeeded} done`);
    await sleep(60_000);
    batch = await client.messages.batches.retrieve(batchId);
  }

  const failed = [];

  for await (const result of await client.messages.batches.results(batchId)) {
    const person = peopleById.get(result.custom_id);

    if (!person) {
      continue;
    }

    if (result.result.type !== "succeeded") {
      failed.push(`${person.name}: ${result.result.type}`);
      continue;
    }

    const message = result.result.message;

    if (message.stop_reason !== "end_turn") {
      failed.push(`${person.name}: stop_reason ${message.stop_reason}`);
      continue;
    }

    const text = message.content.find((block) => block.type === "text")?.text ?? "";

    try {
      milestones[person.id] = normalise(person, Milestones.parse(JSON.parse(text)).milestones);
    } catch (error) {
      failed.push(`${person.name}: ${error.message}`);
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(milestones, null, 2) + "\n");
  console.log(`  ${batchId}: collected, ${failed.length} failed`);

  for (const line of failed) {
    console.log(`    ${line}`);
  }
}

async function main() {
  await mkdir(WIKI_CACHE_DIR, { recursive: true });

  const client = new Anthropic();
  const { people } = await readJson(PEOPLE_FILE, { people: [] });
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const milestones = await readJson(OUT_FILE, {});
  const batches = await readJson(BATCHES_FILE, {});

  if (people.length === 0) {
    throw new Error(`${path.relative(ROOT, PEOPLE_FILE)} is empty; run scripts/build-people.mjs first`);
  }

  // Collect batches submitted by an earlier run.
  for (const [batchId, entry] of Object.entries(batches)) {
    if (entry.collected) {
      continue;
    }

    console.log(`Collecting batch ${batchId} (${entry.ids.length} people)`);
    await collectBatch(client, batchId, peopleById, milestones);
    entry.collected = true;
    await writeFile(BATCHES_FILE, JSON.stringify(batches, null, 2));
  }

  let pending = people
    .filter((person) => !milestones[person.id])
    .sort((a, b) => b.sitelinks - a.sitelinks);

  if (TOP > 0) {
    pending = pending.slice(0, TOP);
  }

  console.log(`${Object.keys(milestones).length} people have milestones, ${pending.length} to do with ${MODEL}`);

  if (pending.length === 0) {
    return;
  }

  const requests = [];

  for (const [index, person] of pending.entries()) {
    process.stdout.write(`Wikipedia ${index + 1}/${pending.length}\r`);

    try {
      const article = await fetchArticle(person);

      if (article.length > 500) {
        requests.push(requestFor(person, article));
      } else {
        console.log(`\n  skipping ${person.name}: article too short`);
      }
    } catch (error) {
      console.log(`\n  skipping ${person.name}: ${error.message}`);
    }
  }

  console.log(`\nSubmitting ${requests.length} requests in batches of ${BATCH_SIZE}`);

  const submitted = [];

  for (let index = 0; index < requests.length; index += BATCH_SIZE) {
    const chunk = requests.slice(index, index + BATCH_SIZE);
    const batch = await client.messages.batches.create({ requests: chunk });

    batches[batch.id] = { ids: chunk.map((request) => request.custom_id), collected: false };
    submitted.push(batch.id);
    await writeFile(BATCHES_FILE, JSON.stringify(batches, null, 2));
    console.log(`  ${batch.id}: ${chunk.length} requests`);
  }

  for (const batchId of submitted) {
    await collectBatch(client, batchId, peopleById, milestones);
    batches[batchId].collected = true;
    await writeFile(BATCHES_FILE, JSON.stringify(batches, null, 2));
  }

  console.log(`Done: ${Object.keys(milestones).length} people with milestones in ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((error) => {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("No valid Anthropic credentials. Put ANTHROPIC_API_KEY=... in .env.local or run `ant auth login`.");
  } else {
    console.error(error);
  }

  process.exit(1);
});
