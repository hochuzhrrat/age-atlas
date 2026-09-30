#!/usr/bin/env node
// For the most looked-up people, one portrait per year from Wikimedia
// Commons' "<Person> in <year>" categories, so a 2011 view can show a 2011
// photo. Writes src/data/portraits.json as
// { [personId]: [{ year, file, artist, license, licenseUrl }, ...] }.
//
//   node scripts/fetch-era-portraits.mjs
//
// Resumable: everything is cached in scripts/.cache/era-portraits.json.
// Env vars:
//   TOP=1000   how many people, by Wikipedia views
//   WORKERS=4  parallel Commons requests

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const CACHE_DIR = path.join(ROOT, "scripts", ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "era-portraits.json");
const PEOPLE_FILE = path.join(ROOT, "src", "data", "people.json");
const OUT_FILE = path.join(ROOT, "src", "data", "portraits.json");

const USER_AGENT = "AgeAtlas/0.1 (https://github.com/hochuzhrrat/age-atlas)";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

const TOP = Number(process.env.TOP ?? 1000);
const WORKERS = Number(process.env.WORKERS ?? 4);
// ONLY="Bradley Cooper" limits a run to one person and prints what it finds.
const ONLY = process.env.ONLY;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(url, params, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${url}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });

      if (response.status === 429 || response.status >= 500) {
        await sleep(5000 * attempt);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === 4) {
        console.warn(`  ${label}: ${error.message ?? error}`);
        return null;
      }

      await sleep(3000 * attempt);
    }
  }

  return null;
}

// The person's category on Commons ("Madonna (entertainer)"): the Commons
// sitelink, or the older P373 claim, or as a last resort the name itself.
async function fetchCommonsCategories(people) {
  const categories = {};

  for (let index = 0; index < people.length; index += 50) {
    const batch = people.slice(index, index + 50);
    const data = await api(
      WIKIDATA_API,
      {
        action: "wbgetentities",
        ids: batch.map((person) => person.id).join("|"),
        props: "claims|sitelinks",
        sitefilter: "commonswiki",
      },
      `wikidata ${index}`
    );

    for (const person of batch) {
      const entity = data?.entities?.[person.id];
      const sitelink = entity?.sitelinks?.commonswiki?.title;
      const claim = entity?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;

      if (typeof sitelink === "string" && sitelink.startsWith("Category:")) {
        categories[person.id] = sitelink.replace(/^Category:/, "");
      } else if (typeof claim === "string") {
        categories[person.id] = claim;
      } else {
        categories[person.id] = person.name;
      }
    }

    process.stdout.write(`  Commons categories ${Math.min(index + 50, people.length)}/${people.length}\r`);
    await sleep(200);
  }

  console.log("");
  return categories;
}

async function listMembers(category, type) {
  const data = await api(
    COMMONS_API,
    { action: "query", list: "categorymembers", cmtitle: `Category:${category}`, cmtype: type, cmlimit: "500" },
    `commons ${category}`
  );

  return (data?.query?.categorymembers ?? []).map((member) => member.title);
}

// "<Category> in 2011" subcategories live either under "<Category> by year"
// or directly under the person's category.
async function fetchYearCategories(category) {
  const pattern = / in (\d{4})$/;
  let subcats = (await listMembers(`${category} by year`, "subcat")).filter((title) => pattern.test(title));

  if (subcats.length === 0) {
    subcats = (await listMembers(category, "subcat")).filter((title) => pattern.test(title));
  }

  return subcats.map((title) => ({
    category: title.replace(/^Category:/, ""),
    year: Number(pattern.exec(title)[1]),
  }));
}

// A cropped single-person shot beats a group photo.
function pickFile(files) {
  const images = files.filter((title) => /\.(jpe?g|png|webp)$/i.test(title));
  const score = (title) =>
    (/crop/i.test(title) ? 2 : 0) + (/\band\b|with|group|cast|team/i.test(title) ? -1 : 0);

  return images.sort((a, b) => score(b) - score(a))[0]?.replace(/^File:/, "");
}

async function fetchCredits(files) {
  const credits = {};

  for (let index = 0; index < files.length; index += 50) {
    const batch = files.slice(index, index + 50);
    const data = await api(
      COMMONS_API,
      {
        action: "query",
        prop: "imageinfo",
        iiprop: "extmetadata",
        iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
        titles: batch.map((file) => `File:${file}`).join("|"),
      },
      `credits ${index}`
    );
    const originalTitle = new Map((data?.query?.normalized ?? []).map(({ from, to }) => [to, from]));

    for (const page of data?.query?.pages ?? []) {
      const title = originalTitle.get(page.title) ?? page.title;
      const meta = page.imageinfo?.[0]?.extmetadata ?? {};

      credits[title.replace(/^File:/, "")] = {
        artist: meta.Artist ? meta.Artist.value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "",
        license: meta.LicenseShortName?.value ?? "",
        licenseUrl: meta.LicenseUrl?.value ?? "",
      };
    }

    await sleep(200);
  }

  return credits;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const { people } = JSON.parse(await readFile(PEOPLE_FILE, "utf8"));
  const cache = JSON.parse(await readFile(CACHE_FILE, "utf8").catch(() => "{}"));
  const top = ONLY
    ? people.filter((person) => person.name === ONLY)
    : [...people].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, TOP);
  const pending = top.filter((person) => !cache[person.id] || ONLY);

  console.log(`Era portraits for the top ${top.length} by views: ${top.length - pending.length} cached, ${pending.length} to fetch`);

  const categories = await fetchCommonsCategories(pending);
  const queue = [...pending];
  let done = 0;

  async function worker() {
    while (queue.length > 0) {
      const person = queue.shift();
      const category = categories[person.id];
      const entry = { category: category ?? null, portraits: [] };

      if (ONLY) {
        console.log(`  ${person.name}: Commons category ${category ?? "none"}`);
      }

      if (category) {
        const yearCategories = await fetchYearCategories(category);

        if (ONLY) {
          console.log(`  years: ${yearCategories.map((entry) => entry.year).join(" ") || "none"}`);
        }

        for (const yearCategory of yearCategories) {
          const lastYear = person.deathYear ?? new Date().getFullYear();

          if (yearCategory.year < person.birthYear || yearCategory.year > lastYear) {
            continue;
          }

          let files = await listMembers(yearCategory.category, "file");

          // Some year categories only hold event subcategories
          // ("Bradley Cooper at SDCC 2011"); look one level down.
          if (files.length === 0) {
            const [subcategory] = await listMembers(yearCategory.category, "subcat");

            if (subcategory) {
              files = await listMembers(subcategory.replace(/^Category:/, ""), "file");
            }
          }

          const file = pickFile(files);

          if (file) {
            entry.portraits.push({ year: yearCategory.year, file });
          }
        }
      }

      cache[person.id] = entry;
      done += 1;

      if (done % 25 === 0) {
        process.stdout.write(`  people ${done}/${pending.length}\r`);
        await writeFile(CACHE_FILE, JSON.stringify(cache));
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, worker));
  await writeFile(CACHE_FILE, JSON.stringify(cache));
  console.log("");

  // Credits for every chosen file that has none yet.
  const uncredited = [];

  for (const entry of Object.values(cache)) {
    for (const portrait of entry.portraits) {
      if (!portrait.license && portrait.license !== "") {
        uncredited.push(portrait.file);
      }
    }
  }

  console.log(`Credits: ${uncredited.length} files to fetch`);
  const credits = await fetchCredits(uncredited);

  for (const entry of Object.values(cache)) {
    for (const portrait of entry.portraits) {
      Object.assign(portrait, credits[portrait.file] ?? {});
      portrait.license ??= "";
    }
  }

  await writeFile(CACHE_FILE, JSON.stringify(cache));

  const output = {};
  let withPortraits = 0;
  let total = 0;

  for (const person of top) {
    const portraits = (cache[person.id]?.portraits ?? []).sort((a, b) => a.year - b.year);

    if (portraits.length > 0) {
      output[person.id] = portraits;
      withPortraits += 1;
      total += portraits.length;
    }
  }

  await writeFile(OUT_FILE, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${total} portraits for ${withPortraits} people to ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
