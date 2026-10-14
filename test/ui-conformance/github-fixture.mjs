// Intercepts every GitHub request the editor makes, so the suite never reads
// or writes a real repository. The fixture is an in-memory content store with
// the same contract the page uses: the contents API (GET/PUT with sha) and
// raw.githubusercontent.com. Responses can be held until the test releases
// them, so pending states are observed without timing assumptions.
import { RECIPES, TAXONOMY_TEXT } from "./surfaces.mjs";

export const OWNER = "kemiller2002";
export const REPO = "culinary-arts-2026-state-fair";
export const CONTENT_ROOT = "culinary/entries";

export const recipeMarkdown = recipe => [
  "---",
  `id: ${recipe.recipeSlug}`,
  `title: ${recipe.recipeName}`,
  `person: ${recipe.personId}`,
  `category: ${recipe.categorySlug}`,
  `class: ${recipe.classSlug}`,
  "status: published",
  "---",
  "",
  `# ${recipe.recipeName}`,
  "",
  "## Main Recipe",
  "",
  "### Ingredients",
  "",
  `- 1 cup ${recipe.recipeSlug} fixture ingredient`,
  "",
  "### Steps",
  "",
  `1. Prepare ${recipe.recipeName}.`
].join("\n");

const toBase64 = text => Buffer.from(text, "utf8").toString("base64");
const fromBase64 = text => Buffer.from(text, "base64").toString("utf8");

export const deferred = () => {
  const handle = {};
  handle.release = new Promise(resolve => { handle.open = resolve; });
  return handle;
};

const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// options.taxonomy: list of { status } for successive raw taxonomy requests
// options.repoStatus / branchStatus: GitHub lookups for Connect
// options.puts: list of { status, release? } for successive PUTs
export const mockGitHub = async (page, options = {}) => {
  const store = new Map(RECIPES.map((recipe, index) => [`${CONTENT_ROOT}/${recipe.recipePath}`, { sha: `sha-${index}-0`, content: recipeMarkdown(recipe) }]));
  const log = { puts: [], taxonomy: 0, gets: [] };
  const taxonomy = options.taxonomy ?? [{ status: 200 }];
  const puts = options.puts ?? [{ status: 201 }];

  await page.route("https://raw.githubusercontent.com/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/metadata/recipe-taxonomy.json")) {
      const next = taxonomy[log.taxonomy] ?? taxonomy.at(-1);
      log.taxonomy += 1;
      await next.release;
      return next.status === 200
        ? route.fulfill({ status: 200, contentType: "application/json", body: TAXONOMY_TEXT })
        : route.fulfill({ status: next.status, body: "unavailable" });
    }
    const path = url.pathname.split("/").slice(4).join("/");
    const file = store.get(path);
    return file ? route.fulfill({ status: 200, contentType: "text/plain", body: file.content }) : route.fulfill({ status: 404, body: "404: Not Found" });
  });

  await page.route("https://api.github.com/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const contents = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (!contents) {
      if (/\/branches\//.test(url.pathname)) return json(route, options.branchStatus ?? 200, { name: "main" });
      return json(route, options.repoStatus ?? 200, { full_name: `${OWNER}/${REPO}` });
    }
    const path = decodeURIComponent(contents[1]);
    if (request.method() === "GET") {
      log.gets = [...log.gets, path];
      const file = store.get(path);
      return file ? json(route, 200, { path, sha: file.sha, content: toBase64(file.content) }) : json(route, 404, { message: "Not Found" });
    }
    const body = request.postDataJSON();
    const next = puts[log.puts.length] ?? puts.at(-1);
    log.puts = [...log.puts, { path, ...body, content: fromBase64(body.content) }];
    await next.release;
    if (next.status >= 400) return json(route, next.status, { message: "fixture failure" });
    const current = store.get(path);
    const sha = `${current?.sha ?? "sha-new"}-saved${log.puts.length}`;
    store.set(path, { sha, content: fromBase64(body.content) });
    return json(route, next.status, { content: { path, sha } });
  });

  return { store, log };
};
