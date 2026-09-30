#!/usr/bin/env node
// Builds src/data/people.json: notable people born 1800–2010 with a portrait
// on Wikimedia Commons and an English Wikipedia article, from Wikidata.
//
//   node scripts/build-people.mjs
//
// Wikidata is queried one birth year at a time (a single query over all humans
// times out). Raw results and Commons credits are cached in scripts/.cache so
// re-runs only fetch what is missing. Tune with env vars:
//   FROM_YEAR=1800 TO_YEAR=2010 PER_YEAR=60 MIN_SITELINKS=40

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const CACHE_DIR = path.join(ROOT, "scripts", ".cache");
const OUT_FILE = path.join(ROOT, "src", "data", "people.json");

const USER_AGENT = "AgeAtlas/0.1 (https://github.com/hochuzhrrat/age-atlas)";
const SPARQL_URL = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const PAGEVIEWS_API =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user";

const FROM_YEAR = Number(process.env.FROM_YEAR ?? 1800);
const TO_YEAR = Number(process.env.TO_YEAR ?? 2010);
const PER_YEAR = Number(process.env.PER_YEAR ?? 60);
const MIN_SITELINKS = Number(process.env.MIN_SITELINKS ?? 40);

// Domain is read from the Wikidata description first ("American singer,
// songwriter…" leads with the main identity), then from the occupation list.
// Order matters only for ties in the occupation fallback.
const DOMAINS = [
  ["Music", /singer|musician|composer|songwriter|rapper|pianist|conductor|guitarist|drummer|violinist|\bdj\b|band|record producer|music/i],
  ["Film & TV", /\bactor|actress|film|television|screenwriter|comedian|presenter|\btv\b|youtuber|animator|filmmaker|cinema/i],
  ["Art & Design", /painter|sculptor|photographer|architect|designer|\bartist|illustrator|cartoonist|printmaker|ceramist|graffiti/i],
  ["Literature", /writer|poet|novelist|journalist|playwright|author|essayist|critic|lyricist|translator|philosopher|historian|linguist/i],
  ["Politics", /politician|president|prime minister|chancellor|diplomat|monarch|\bking\b|queen|emperor|empress|dictator|revolutionary|activist|statesman|stateswoman|minister|senator|governor|mayor|lawyer|judge|jurist|first lady|princess|prince\b|duke|leader of/i],
  ["Science", /physicist|chemist|biologist|mathematician|engineer|inventor|scientist|astronaut|cosmonaut|economist|psycholog|psychiatr|psychoanaly|physician|surgeon|astronomer|geolog|computer|programmer|researcher|neuro|sociolog|anthropolog|archaeolog|explorer|aviator|naturalist|zoolog|botanist|physiolog|virolog|geneticist|patholog|pharmac|epidemiolog|paleontolog|pilot/i],
  ["Sport", /footballer|player|athlete|boxer|tennis|racing driver|swimmer|gymnast|cyclist|chess|wrestler|coach|golfer|skier|skater|sprinter|runner|martial art|jockey|referee|olympi|basketball|baseball|hockey|cricketer|rugby|sport|climber|surfer|bodybuilder|equestrian|fencer|rower|sailor|weightlifter|footballer|mixed martial/i],
  ["Business", /entrepreneur|businessperson|businessman|businesswoman|business magnate|business|executive|industrialist|banker|investor|chief executive|merchant|philanthropist|billionaire|tycoon|financier/i],
  ["Fashion", /\bmodel\b|fashion|couturier|stylist|supermodel/i],
  ["Military", /military|general\b|admiral|officer|soldier|marshal|commander|warlord|aviator/i],
  ["Religion", /priest|bishop|pope|theologian|rabbi|imam|cleric|monk|\bnun\b|religious|saint|preacher|missionary|cardinal|dalai lama|guru|evangelist/i],
];

// Heads of state and government are politicians whatever else the
// description mentions first ("Pakistani soldier and politician").
const OFFICE = /\b(president|prime minister|chancellor|head of state|dictator|governor|senator|monarch|emperor|empress|secretary[- ]general|united nations)\b/i;

function domainFromDescription(description) {
  if (OFFICE.test(description)) {
    return "Politics";
  }

  let best = null;

  for (const [domain, pattern] of DOMAINS) {
    const match = pattern.exec(description);

    if (match && (best === null || match.index < best.index)) {
      best = { domain, index: match.index };
    }
  }

  return best?.domain ?? null;
}

function domainFromOccupations(occupations) {
  const votes = new Map();

  for (const occupation of occupations) {
    const domain = DOMAINS.find(([, pattern]) => pattern.test(occupation))?.[0];

    if (domain) {
      votes.set(domain, (votes.get(domain) ?? 0) + 1);
    }
  }

  let best = null;

  for (const [domain] of DOMAINS) {
    const count = votes.get(domain) ?? 0;

    if (count > 0 && (best === null || count > best.count)) {
      best = { domain, count };
    }
  }

  return best?.domain ?? "Other";
}

// "American singer (born 1958)" → "American singer"; the years are stored
// separately. Also capitalises the first letter.
function cleanDescription(description) {
  const cleaned = description
    .replace(/\s*\((?:born|b\.)?\s*\d{3,4}(?:\s*[–-]\s*\d{3,4})?\)\s*$/i, "")
    .replace(/\s*\(\d{3,4}[–-]\d{3,4}\)/g, "")
    .trim();

  const capitalised = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  // One line in the UI: cut long descriptions at a word boundary.
  if (capitalised.length <= 80) {
    return capitalised;
  }

  return `${capitalised.slice(0, 80).replace(/\s+\S*$/, "").replace(/[,;:]$/, "")}…`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, init, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(120_000),
      });

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after")) || 10 * attempt;
        console.warn(`  ${label}: HTTP ${response.status}, retrying in ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`${label}: HTTP ${response.status} ${await response.text()}`);
      }

      return response;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }

      console.warn(`  ${label}: ${error.message ?? error}, retrying`);
      await sleep(5000 * attempt);
    }
  }
}

function sparqlForYear(year) {
  return `
SELECT ?item ?itemLabel ?itemDescription ?sitelinks ?dob ?dod ?image ?article
       (GROUP_CONCAT(DISTINCT ?occLabel; separator="|") AS ?occupations)
       (SAMPLE(?countryLabel) AS ?country)
WHERE {
  ?item wdt:P569 ?dob .
  hint:Prior hint:rangeSafe true .
  FILTER(?dob >= "${year}-01-01T00:00:00Z"^^xsd:dateTime && ?dob < "${year + 1}-01-01T00:00:00Z"^^xsd:dateTime)
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${MIN_SITELINKS})
  ?item wdt:P31 wd:Q5 ;
        wdt:P18 ?image .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?item wdt:P570 ?dod . }
  OPTIONAL { ?item wdt:P106 ?occ . ?occ rdfs:label ?occLabel . FILTER(LANG(?occLabel) = "en") }
  OPTIONAL { ?item wdt:P27 ?c . ?c rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?itemDescription ?sitelinks ?dob ?dod ?image ?article
ORDER BY DESC(?sitelinks)
LIMIT ${PER_YEAR * 2}`;
}

async function readCache(name) {
  try {
    return JSON.parse(await readFile(path.join(CACHE_DIR, name), "utf8"));
  } catch {
    return null;
  }
}

async function writeCache(name, value) {
  await writeFile(path.join(CACHE_DIR, name), JSON.stringify(value));
}

async function fetchYear(year) {
  const cacheName = `wikidata-${year}.json`;
  const cached = await readCache(cacheName);

  if (cached) {
    return cached;
  }

  const url = `${SPARQL_URL}?format=json&query=${encodeURIComponent(sparqlForYear(year))}`;
  const started = Date.now();
  const response = await fetchWithRetry(
    url,
    { headers: { Accept: "application/sparql-results+json" } },
    `wikidata ${year}`
  );
  const bindings = (await response.json()).results.bindings;

  console.log(`  ${year}: ${bindings.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await writeCache(cacheName, bindings);
  await sleep(500);

  return bindings;
}

function value(binding, key) {
  return binding[key]?.value ?? "";
}

function fileFromImageUrl(imageUrl) {
  return decodeURIComponent(imageUrl.split("/Special:FilePath/")[1] ?? "");
}

function wikipediaTitle(binding) {
  return decodeURIComponent(value(binding, "article").split("/wiki/")[1] ?? "").replace(/_/g, " ");
}

// The label service occasionally hands back the id instead of the label;
// the article title, minus a disambiguator like "(musician)", is a fine name.
function nameOf(binding) {
  const label = value(binding, "itemLabel");

  if (label && !/^Q\d+$/.test(label)) {
    return label;
  }

  return wikipediaTitle(binding).replace(/\s*\([^)]*\)\s*$/, "");
}

function toPerson(binding) {
  const id = value(binding, "item").split("/").pop();
  const birthYear = Number(value(binding, "dob").slice(0, 4));
  const deathYear = Number(value(binding, "dod").slice(0, 4)) || undefined;
  const rawDescription = value(binding, "itemDescription");
  const occupations = value(binding, "occupations").split("|").filter(Boolean);

  return {
    id,
    name: nameOf(binding),
    description: rawDescription ? cleanDescription(rawDescription) : "",
    birthYear,
    ...(deathYear && deathYear >= birthYear ? { deathYear } : {}),
    domain: domainFromDescription(rawDescription) ?? domainFromOccupations(occupations),
    ...(value(binding, "country") ? { country: value(binding, "country") } : {}),
    sitelinks: Number(value(binding, "sitelinks")),
    wikipedia: wikipediaTitle(binding),
    portrait: { file: fileFromImageUrl(value(binding, "image")) },
  };
}

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// A four-digit year from Commons' free-form date fields ("2011-07-22",
// "circa 1920", "2025-10-14 18:03:52").
function yearFromDate(value) {
  const match = /\b(1[89]\d{2}|20\d{2})\b/.exec(value ?? "");
  return match ? Number(match[1]) : undefined;
}

// Author, licence and the year the photo was taken, 50 files per API call.
async function fetchCredits(files) {
  const cacheName = "commons-credits-v2.json";
  const credits = (await readCache(cacheName)) ?? {};
  const missing = files.filter((file) => !credits[file]);

  console.log(`Commons credits: ${files.length - missing.length} cached, ${missing.length} to fetch`);

  for (let index = 0; index < missing.length; index += 50) {
    const batch = missing.slice(index, index + 50);
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      iiprop: "extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|DateTimeOriginal",
      titles: batch.map((file) => `File:${file}`).join("|"),
      format: "json",
      formatversion: "2",
    });
    const response = await fetchWithRetry(
      COMMONS_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      },
      `commons ${index}`
    );
    const data = await response.json();
    const originalTitle = new Map(
      (data.query?.normalized ?? []).map(({ from, to }) => [to, from])
    );

    for (const page of data.query?.pages ?? []) {
      const title = originalTitle.get(page.title) ?? page.title;
      const file = title.replace(/^File:/, "");
      const meta = page.imageinfo?.[0]?.extmetadata ?? {};

      const year = yearFromDate(meta.DateTimeOriginal?.value);

      credits[file] = {
        artist: meta.Artist ? stripHtml(meta.Artist.value) : "",
        license: meta.LicenseShortName?.value ?? "",
        licenseUrl: meta.LicenseUrl?.value ?? "",
        ...(year ? { year } : {}),
      };
    }

    // Files the API did not return (deleted, renamed) still get an entry so
    // we do not ask for them again.
    for (const file of batch) {
      credits[file] ??= { artist: "", license: "", licenseUrl: "" };
    }

    await writeCache(cacheName, credits);
    process.stdout.write(`  ${Math.min(index + 50, missing.length)}/${missing.length}\r`);
    await sleep(300);
  }

  return credits;
}

// The last twelve full months, as YYYYMMDD bounds for the pageviews API.
function pageviewsRange() {
  const end = new Date();
  end.setUTCDate(0); // last day of the previous month
  const start = new Date(end);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 11);
  const format = (date) => date.toISOString().slice(0, 10).replace(/-/g, "");

  return { start: format(start), end: format(end) };
}

// English Wikipedia views over the last year: who people actually look up,
// as opposed to sitelinks, which reward encyclopaedic reach.
async function fetchPageviews(people) {
  const cacheName = "pageviews.json";
  const cache = (await readCache(cacheName)) ?? {};
  const { start, end } = pageviewsRange();
  const range = `${start}-${end}`;
  const queue = people.filter((person) => cache[person.id]?.range !== range);
  let done = 0;

  console.log(`Pageviews ${start}–${end}: ${people.length - queue.length} cached, ${queue.length} to fetch`);

  async function worker() {
    while (queue.length > 0) {
      const person = queue.shift();
      const title = encodeURIComponent(person.wikipedia.replace(/ /g, "_"));
      let views = 0;

      try {
        const response = await fetch(`${PAGEVIEWS_API}/${title}/monthly/${start}/${end}`, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        });

        if (response.status === 429 || response.status >= 500) {
          await sleep(3000);
          queue.push(person);
          continue;
        }

        if (response.ok) {
          views = ((await response.json()).items ?? []).reduce((sum, item) => sum + item.views, 0);
        }
      } catch (error) {
        console.warn(`  pageviews ${person.name}: ${error.message ?? error}`);
      }

      cache[person.id] = { range, views };
      done += 1;

      if (done % 200 === 0) {
        process.stdout.write(`  ${done}/${queue.length + done}\r`);
        await writeCache(cacheName, cache);
      }
    }
  }

  await Promise.all(Array.from({ length: 12 }, worker));
  await writeCache(cacheName, cache);

  return Object.fromEntries(people.map((person) => [person.id, cache[person.id]?.views ?? 0]));
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_FILE), { recursive: true });

  console.log(`Wikidata: birth years ${FROM_YEAR}–${TO_YEAR}, up to ${PER_YEAR} per year, sitelinks ≥ ${MIN_SITELINKS}`);

  const people = new Map();

  for (let year = FROM_YEAR; year <= TO_YEAR; year++) {
    const bindings = await fetchYear(year);
    let taken = 0;

    for (const binding of bindings) {
      const person = toPerson(binding);

      if (people.has(person.id) || !person.name || !person.wikipedia) {
        continue;
      }

      people.set(person.id, person);
      taken += 1;

      if (taken >= PER_YEAR) {
        break;
      }
    }
  }

  const list = [...people.values()];
  const credits = await fetchCredits(list.map((person) => person.portrait.file));
  const views = await fetchPageviews(list);

  for (const person of list) {
    Object.assign(person.portrait, credits[person.portrait.file]);
    person.views = views[person.id];
  }

  list.sort((a, b) => b.views - a.views || b.sitelinks - a.sitelinks);

  await writeFile(
    OUT_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), people: list }, null, 2) + "\n"
  );

  const byDomain = new Map();
  for (const person of list) {
    byDomain.set(person.domain, (byDomain.get(person.domain) ?? 0) + 1);
  }

  console.log(`\nWrote ${list.length} people to ${path.relative(ROOT, OUT_FILE)}`);
  for (const [domain, count] of [...byDomain].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${domain.padEnd(14)} ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
