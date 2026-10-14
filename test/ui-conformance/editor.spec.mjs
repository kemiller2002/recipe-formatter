// UI conformance suite for the GitHub Recipe Editor against
// visual-engineering/UI-LAYOUT-INTERACTION@1.0.0. Controls resolve by role and
// accessible name, waits are web-first assertions, and every action compares
// observed pre- and post-state. No coordinates, no fixed sleeps. GitHub is
// intercepted by github-fixture.mjs.
import { expect, test } from "@playwright/test";
import {
  CONTRACT_WIDTHS,
  expectActionOutcome,
  expectLabelIntact,
  expectNoOverflow,
  expectPeerAlignment,
  inventoryActions,
  recordTabSequence,
  scaleDefaultText,
  settleFontsAndFrames,
  wasFocusedDuringSequence
} from "./forma-conformance/index.mjs";
import { CONTENT_ROOT, OWNER, REPO, deferred, mockGitHub, recipeMarkdown } from "./github-fixture.mjs";
import { EDITOR_ACTIONS, RECIPES, SURFACES, recipeItemName } from "./surfaces.mjs";

const annotate = (type, description) => test.info().annotations.push({ type, description });
const action = id => annotate("uli-action", `editor/${id}`);

const status = page => page.getByRole("banner").locator("#connectionStatus");
const library = page => page.getByRole("complementary", { name: "Recipe Files" });
const structured = page => page.getByRole("tabpanel", { name: "Structured" });
const editorHeading = page => page.getByRole("heading", { level: 2 }).nth(1);
const validation = page => page.getByRole("region", { name: "Validation findings" });
const recipeCount = page => library(page).getByText(/^\d+ recipes?$/);
const rawMarkdown = page => page.getByRole("textbox", { name: "Raw Markdown" });
const saveButton = page => page.getByRole("button", { name: "Save to GitHub" });

const TAXONOMY_LOADED = "Recipe taxonomy loaded from GitHub.";
const FIRST = RECIPES[0];
const LONGEST_PATH = RECIPES.reduce((longest, recipe) => (recipe.recipePath.length > longest.recipePath.length ? recipe : longest));

const openEditor = async (page, options) => {
  const github = await mockGitHub(page, options);
  await page.goto("/");
  await expect(status(page)).toHaveText(options?.expectedStatus ?? TAXONOMY_LOADED);
  return github;
};

const loadRecipe = async (page, recipe) => {
  await library(page).getByRole("button", { name: recipeItemName(recipe) }).click();
  await expect(status(page)).toHaveText(`Loaded ${recipe.recipeName} from GitHub.`);
  await expect(editorHeading(page)).toHaveText(recipe.recipeName);
};

const nameMatches = (declared, actual) => (declared instanceof RegExp ? declared.test(actual) : declared === actual);

// --- ULI-L05/L06/L09/A10: every contract width ------------------------------

for (const width of CONTRACT_WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("renders without overflow, with intact action labels", async ({ page }) => {
      annotate("uli-surface", "editor");
      await openEditor(page);
      await page.getByRole("button", { name: "Add Sub Recipe" }).click();
      await page.getByRole("button", { name: "Add Section" }).click();
      await expectNoOverflow(page);
      for (const name of ["Connect", "Reload Recipes", "New Recipe", "Add Sub Recipe", "Add Section", "Validate", "Save to GitHub"]) {
        await expectLabelIntact(page.getByRole("button", { name, exact: true }));
      }
      for (const name of ["Structured", "Markdown", "Preview"]) await expectLabelIntact(page.getByRole("tab", { name }));
    });

    test("renders only declared, named actions", async ({ page }) => {
      annotate("uli-surface", "editor");
      await openEditor(page);
      await page.getByRole("button", { name: "Add Sub Recipe" }).click();
      await page.getByRole("button", { name: "Add Sub Recipe" }).click();
      await page.getByRole("button", { name: "Add Section" }).click();
      await page.getByRole("button", { name: "Add Section" }).click();
      await settleFontsAndFrames(page);
      const rendered = await inventoryActions(page.locator("body"));
      const undeclared = rendered.filter(item => !EDITOR_ACTIONS.some(declared => declared.control.role === item.role && nameMatches(declared.control.name, item.name)));
      expect(undeclared.map(item => `${item.role} "${item.name}"`), "ULI-A10: enabled actions without a declared contract").toEqual([]);
      expect(rendered.filter(item => !item.name), "ULI-A06: actions without an accessible name").toEqual([]);
    });

    test("shows the longest recipe path without overflow or clipping", async ({ page }) => {
      annotate("uli-surface", "editor");
      await openEditor(page);
      await loadRecipe(page, LONGEST_PATH);
      await expect(page.getByText(`${CONTENT_ROOT}/${LONGEST_PATH.recipePath}`, { exact: true })).toBeVisible();
      await expectNoOverflow(page);
    });

    test("reflows at 200% text without overflow", async ({ page }) => {
      annotate("uli-surface", "editor");
      await openEditor(page);
      await scaleDefaultText(page, 2);
      await expectNoOverflow(page);
      await loadRecipe(page, LONGEST_PATH);
      await expectNoOverflow(page);
      for (const name of ["Connect", "New Recipe", "Validate", "Save to GitHub"]) {
        const control = page.getByRole("button", { name, exact: true });
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeInViewport();
      }
    });
  });
}

// --- ULI-L01/L02/L09/L10: declared alignment groups ------------------------

const scopeOf = (page, scope) => {
  if (!scope) return undefined;
  if (scope === "banner" || scope === "complementary") return page.getByRole(scope);
  return page.getByRole("tabpanel", { name: scope });
};

for (const surface of SURFACES) {
  for (const group of surface.groups) {
    for (const width of group.widths) {
      test(`${surface.id}: ${group.id} aligns at ${width}px`, async ({ page }) => {
        annotate("uli-group", `${surface.id}/${group.id}@${width}`);
        await page.setViewportSize({ width, height: 900 });
        await openEditor(page);
        await expectPeerAlignment(page, { ruleId: group.ruleId, id: group.id, edge: group.edge, peers: group.peers, scope: scopeOf(page, group.scope) });
      });
    }
  }
}

// --- Connection ------------------------------------------------------------

test("Connect reports a verified connection", async ({ page }) => {
  action("connect");
  await openEditor(page);
  await expect(status(page)).toHaveText(TAXONOMY_LOADED);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(status(page)).toHaveText(`Connected to ${OWNER}/${REPO} on main`);
  await expect(status(page)).toHaveAttribute("data-tone", "ready");
});

test("Connect reports a failed repository lookup and recovers", async ({ page }) => {
  action("connect");
  await openEditor(page, { repoStatus: 404 });
  await expect(status(page)).toHaveText(TAXONOMY_LOADED);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(status(page)).toHaveText("Repository lookup failed: 404");
  await expect(status(page)).toHaveAttribute("data-tone", "danger");
  await page.getByRole("textbox", { name: "Owner" }).fill("");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(status(page)).toHaveText("Owner, repository, and branch are required.");
});

test("Reload Recipes replaces fallback data with the GitHub taxonomy", async ({ page }) => {
  action("reload-recipes");
  const github = await openEditor(page, { taxonomy: [{ status: 503 }, { status: 200 }], expectedStatus: "Using local fallback taxonomy data." });
  await page.getByRole("button", { name: "Reload Recipes" }).click();
  await expect(status(page)).toHaveText(TAXONOMY_LOADED);
  await expect(status(page)).toHaveAttribute("data-tone", "ready");
  expect(github.log.taxonomy).toBe(2);
});

test("Reload Recipes reports progress and a total failure honestly", async ({ page }) => {
  action("reload-recipes");
  const pending = deferred();
  await openEditor(page, { taxonomy: [{ status: 200 }, { status: 503, ...pending }] });
  await page.route("**/pilot-data/recipe-taxonomy.json", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.getByRole("button", { name: "Reload Recipes" }).click();
  await expect(status(page)).toHaveText("Reloading recipe taxonomy...");
  pending.open();
  await expect(status(page)).toHaveText("Recipe taxonomy failed to load: Fallback taxonomy fetch failed: 503");
  await expect(status(page)).toHaveAttribute("data-tone", "danger");
  // The list loaded earlier stays usable.
  await expect(recipeCount(page)).toHaveText(`${RECIPES.length} recipes`);
});

// --- Library ---------------------------------------------------------------

test("Search filters the recipe list and shows the empty state", async ({ page }) => {
  action("search");
  await openEditor(page);
  await expect(recipeCount(page)).toHaveText(`${RECIPES.length} recipes`);
  const search = library(page).getByRole("textbox", { name: "Search" });
  await search.fill(FIRST.recipeName);
  await expect(recipeCount(page)).toHaveText("1 recipe");
  await expect(library(page).getByRole("button", { name: recipeItemName(FIRST) })).toBeVisible();
  await search.fill("no recipe has this name");
  await expect(recipeCount(page)).toHaveText("0 recipes");
  await expect(library(page).getByText("No recipes match the current search and filters.")).toBeVisible();
  await search.fill("");
  await expect(recipeCount(page)).toHaveText(`${RECIPES.length} recipes`);
});

const countBy = predicate => RECIPES.filter(predicate).length;
const plural = count => `${count} recipe${count === 1 ? "" : "s"}`;

test("Person filter lists only that person's recipes", async ({ page }) => {
  action("filter-person");
  await openEditor(page);
  const person = library(page).getByRole("combobox", { name: "Person" });
  await person.selectOption({ label: "Colin Miller" });
  await expect(recipeCount(page)).toHaveText(plural(countBy(recipe => recipe.personId === "colin")));
  await person.selectOption({ label: "Kevin Miller" });
  await expect(recipeCount(page)).toHaveText(plural(countBy(recipe => recipe.personId === "kevin")));
});

test("Category filter lists only that category's recipes", async ({ page }) => {
  action("filter-category");
  await openEditor(page);
  const category = library(page).getByRole("combobox", { name: "Category" });
  await category.selectOption(FIRST.categorySlug);
  await expect(recipeCount(page)).toHaveText(plural(countBy(recipe => recipe.categorySlug === FIRST.categorySlug)));
  await expect(library(page).getByRole("button", { name: recipeItemName(FIRST) })).toBeVisible();
});

test("Class filter lists only that class's recipes", async ({ page }) => {
  action("filter-class");
  await openEditor(page);
  await library(page).getByRole("combobox", { name: "Class" }).selectOption(FIRST.classSlug);
  await expect(recipeCount(page)).toHaveText(plural(countBy(recipe => recipe.classSlug === FIRST.classSlug)));
  await expect(library(page).getByRole("button", { name: recipeItemName(FIRST) })).toHaveCount(1);
});

for (const recipe of RECIPES) {
  test(`opening "${recipe.recipeName}" loads its file into the editor`, async ({ page }) => {
    action(`open-${recipe.recipeSlug}`);
    const github = await openEditor(page);
    const item = library(page).getByRole("button", { name: recipeItemName(recipe) });
    await expect(item).not.toHaveAttribute("aria-current", "true");
    await expect(editorHeading(page)).toHaveText("New local recipe");
    await item.click();
    await expect(status(page)).toHaveText(`Loaded ${recipe.recipeName} from GitHub.`);
    await expect(editorHeading(page)).toHaveText(recipe.recipeName);
    await expect(item).toHaveAttribute("aria-current", "true");
    await expect(structured(page).getByRole("textbox", { name: "Title" })).toHaveValue(recipe.recipeName);
    await expect(structured(page).getByRole("textbox", { name: "Main Ingredients" })).toHaveValue(`- 1 cup ${recipe.recipeSlug} fixture ingredient`);
    await expect(page.getByText("Matches GitHub", { exact: true })).toBeVisible();
    expect(github.log.gets).toContain(`${CONTENT_ROOT}/${recipe.recipePath}`);
  });
}

test("a failed recipe load is reported and does not mark the item current", async ({ page }) => {
  action(`open-${FIRST.recipeSlug}`);
  const github = await openEditor(page);
  github.store.delete(`${CONTENT_ROOT}/${FIRST.recipePath}`);
  const item = library(page).getByRole("button", { name: recipeItemName(FIRST) });
  await item.click();
  await expect(status(page)).toHaveText(/^Recipe load failed with 404\./);
  await expect(editorHeading(page)).toHaveText("New local recipe");
  await expect(item).not.toHaveAttribute("aria-current", "true");
});

test("New Recipe clears a loaded recipe", async ({ page }) => {
  action("new-recipe");
  await openEditor(page);
  await loadRecipe(page, FIRST);
  await page.getByRole("button", { name: "New Recipe" }).click();
  await expect(editorHeading(page)).toHaveText("New local recipe");
  await expect(structured(page).getByRole("textbox", { name: "Title" })).toHaveValue("");
  await expect(library(page).locator("[aria-current=true]")).toHaveCount(0);
});

test("New Recipe asks before discarding unsaved edits and keeps them when declined", async ({ page }) => {
  action("new-recipe");
  await openEditor(page);
  await loadRecipe(page, FIRST);
  await structured(page).getByRole("textbox", { name: "Title" }).fill("Edited title");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "New Recipe" }).click();
  await expect(structured(page).getByRole("textbox", { name: "Title" })).toHaveValue("Edited title");
  await expect(page.getByText("Edited locally", { exact: true })).toBeVisible();
});

// --- Editor views ------------------------------------------------------------

const panelState = page => Promise.all(["Structured", "Markdown", "Preview"].map(async name => ({
  name,
  selected: await page.getByRole("tab", { name }).getAttribute("aria-selected"),
  shown: await page.locator(`#${name.toLowerCase()}Panel`).isVisible()
})));

for (const name of ["Markdown", "Preview", "Structured"]) {
  test(`the ${name} tab selects its panel`, async ({ page }) => {
    action(`tab-${name.toLowerCase()}`);
    await openEditor(page);
    // Start from a different tab so the outcome is a real change.
    const start = name === "Structured" ? "Preview" : "Structured";
    await page.getByRole("tab", { name: start }).click();
    await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "false");
    await expectActionOutcome(page, { ruleId: "ULI-A02", action: { role: "tab", name }, outcome: { kind: "attribute", target: { role: "tab", name }, attribute: "aria-selected", expected: "true" } });
    await expect(page.getByRole("tabpanel", { name })).toBeVisible();
    expect((await panelState(page)).filter(panel => panel.shown).map(panel => panel.name)).toEqual([name]);
    expect((await panelState(page)).filter(panel => panel.selected === "true").map(panel => panel.name)).toEqual([name]);
  });
}

test("tabs follow the arrow-key pattern", async ({ page }) => {
  action("tab-markdown");
  action("tab-preview");
  await openEditor(page);
  await page.getByRole("tab", { name: "Structured" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Markdown" })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Markdown" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Structured" })).toHaveAttribute("aria-selected", "true");
});

test("editing the title updates the Markdown, suggested ID and preview", async ({ page }) => {
  action("edit-title");
  await openEditor(page);
  await structured(page).getByRole("textbox", { name: "Title" }).fill("Conformance Chili");
  await page.getByRole("tab", { name: "Markdown" }).click();
  await expect(rawMarkdown(page)).toHaveValue(/^# Conformance Chili$/m);
  // The recipe ID is suggested from the title until one is typed.
  await expect(rawMarkdown(page)).toHaveValue(/^id: conformance-chili$/m);
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("tabpanel", { name: "Preview" }).getByRole("heading", { name: "Conformance Chili" })).toBeVisible();
});

// --- Sub recipes and optional sections ---------------------------------------

test("Add Sub Recipe adds a card and writes its section", async ({ page }) => {
  action("add-sub-recipe");
  await openEditor(page);
  await expect(structured(page).getByText("No sub recipes yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add Sub Recipe" }).click();
  await expect(structured(page).getByRole("button", { name: "Remove Sub Recipe 1" })).toBeVisible();
  await expect(structured(page).getByText("No sub recipes yet.", { exact: false })).toHaveCount(0);
  await page.getByRole("tab", { name: "Markdown" }).click();
  await expect(rawMarkdown(page)).toHaveValue(/^## Sub Recipe$/m);
});

test("Add Section adds an optional section card", async ({ page }) => {
  action("add-section");
  await openEditor(page);
  await page.getByRole("button", { name: "Add Section" }).click();
  await expect(structured(page).getByRole("button", { name: "Remove Optional Section 1" })).toBeVisible();
  await expect(structured(page).getByText("No optional sections yet.", { exact: false })).toHaveCount(0);
});

const cardTitles = (page, container) => page.locator(`${container} .stack-card-head strong`).allTextContents();

for (const [kind, container, add, field] of [
  ["Sub Recipe", "#subRecipes", "Add Sub Recipe", "Name"],
  ["Optional Section", "#optionalSections", "Add Section", "Section Title"]
]) {
  test(`${kind} cards reorder and remove, with edge moves disabled`, async ({ page }) => {
    ["card-move-up", "card-move-down", "card-remove"].forEach(action);
    await openEditor(page);
    await page.getByRole("button", { name: add }).click();
    await page.getByRole("button", { name: add }).click();
    const fields = page.locator(container).getByRole("textbox", { name: field, exact: true });
    await fields.nth(0).fill("Alpha");
    await fields.nth(1).fill("Beta");
    // Names update when the cards re-render; trigger one through a move.
    await page.getByRole("button", { name: `Move ${kind} 2 up` }).click();
    await expect.poll(() => cardTitles(page, container)).toEqual(["Beta", "Alpha"]);
    // ULI-A01/A04: no enabled no-op at the list edges.
    await expect(page.getByRole("button", { name: "Move Beta up" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move Alpha down" })).toBeDisabled();
    await page.getByRole("button", { name: "Move Beta down" }).click();
    await expect.poll(() => cardTitles(page, container)).toEqual(["Alpha", "Beta"]);
    await page.getByRole("button", { name: "Remove Alpha" }).click();
    await expect.poll(() => cardTitles(page, container)).toEqual(["Beta"]);
    await expect(page.getByRole("button", { name: "Move Beta up" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move Beta down" })).toBeDisabled();
    await page.getByRole("button", { name: "Remove Beta" }).click();
    await expect(page.locator(container).getByText(/^No (sub recipes|optional sections) yet\./)).toBeVisible();
  });
}

// --- Raw Markdown ----------------------------------------------------------

test("Apply Markdown parses the raw Markdown into the structured fields", async ({ page }) => {
  action("apply-markdown");
  await openEditor(page);
  await loadRecipe(page, FIRST);
  await page.getByRole("tab", { name: "Markdown" }).click();
  await rawMarkdown(page).fill(recipeMarkdown(FIRST).replace(`title: ${FIRST.recipeName}`, "title: Applied Title"));
  await expect(validation(page)).toContainText("Raw Markdown has edits that are not applied yet.");
  await page.getByRole("button", { name: "Apply Markdown" }).click();
  await expect(validation(page)).not.toContainText("Raw Markdown has edits that are not applied yet.");
  await page.getByRole("tab", { name: "Structured" }).click();
  await expect(structured(page).getByRole("textbox", { name: "Title" })).toHaveValue("Applied Title");
});

test("Revert to Loaded restores the file loaded from GitHub", async ({ page }) => {
  action("revert-markdown");
  await openEditor(page);
  await page.getByRole("tab", { name: "Markdown" }).click();
  // ULI-A04: nothing loaded yet, so the control is disabled and says why.
  await expect(page.getByRole("button", { name: "Revert to Loaded" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Revert to Loaded" })).toHaveAccessibleDescription("Nothing has been loaded from GitHub yet, so there is no version to revert to.");
  await loadRecipe(page, FIRST);
  await page.getByRole("tab", { name: "Markdown" }).click();
  await rawMarkdown(page).fill("# Scratch");
  await expect(page.getByText("Edited locally", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revert to Loaded" }).click();
  await expect(rawMarkdown(page)).toHaveValue(recipeMarkdown(FIRST));
  await expect(page.getByText("Matches GitHub", { exact: true })).toBeVisible();
});

// --- Validate and save -----------------------------------------------------

test("Validate lists findings and moves focus to them", async ({ page }) => {
  action("validate");
  await openEditor(page);
  await expect(validation(page)).not.toBeFocused();
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(validation(page)).toBeFocused();
  await expect(validation(page)).toContainText("Recipe title is required.");
  await structured(page).getByRole("textbox", { name: "Title" }).fill("Validated Title");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(validation(page)).not.toContainText("Recipe title is required.");
});

test("Save commits exactly the shown Markdown, busy while pending", async ({ page }) => {
  action("save");
  const pending = deferred();
  const github = await openEditor(page, { puts: [{ status: 200, ...pending }] });
  await loadRecipe(page, FIRST);
  await structured(page).getByRole("textbox", { name: "Title" }).fill("Saved Title");
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();
  await expect(saveButton(page)).toHaveAttribute("aria-busy", "true");
  await expect(status(page)).toHaveText("Saving to GitHub...");
  // A second activation while pending sends nothing (ULI-A07).
  await saveButton(page).click({ force: true });
  pending.open();
  await expect(status(page)).toHaveText("Recipe saved to GitHub.");
  await expect(saveButton(page)).toBeEnabled();
  await expect(page.getByText("Matches GitHub", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Markdown" }).click();
  expect(github.log.puts).toHaveLength(1);
  expect(github.log.puts[0]).toMatchObject({ path: `${CONTENT_ROOT}/${FIRST.recipePath}`, sha: "sha-0-0", branch: "main" });
  expect(github.log.puts[0].content).toBe(await rawMarkdown(page).inputValue());
  expect(github.log.puts[0].content).toMatch(/^title: Saved Title$/m);
});

test("a failed save keeps the edits, reports the error and succeeds on retry", async ({ page }) => {
  action("save");
  const github = await openEditor(page, { puts: [{ status: 500 }, { status: 200 }] });
  await loadRecipe(page, FIRST);
  await structured(page).getByRole("textbox", { name: "Title" }).fill("Retry Title");
  await saveButton(page).click();
  await expect(status(page)).toHaveText("Save failed: 500");
  await expect(status(page)).toHaveAttribute("data-tone", "danger");
  await expect(page.getByText("Edited locally", { exact: true })).toBeVisible();
  await expect(structured(page).getByRole("textbox", { name: "Title" })).toHaveValue("Retry Title");
  await saveButton(page).click();
  await expect(status(page)).toHaveText("Recipe saved to GitHub.");
  expect(github.log.puts).toHaveLength(2);
});

test("a remote change is reported as a conflict and nothing is written", async ({ page }) => {
  action("save");
  const github = await openEditor(page);
  await loadRecipe(page, FIRST);
  github.store.get(`${CONTENT_ROOT}/${FIRST.recipePath}`).sha = "changed-elsewhere";
  await structured(page).getByRole("textbox", { name: "Title" }).fill("Conflicting Title");
  await saveButton(page).click();
  await expect(status(page)).toHaveText("Remote conflict detected. The GitHub file changed after this editor loaded it.");
  expect(github.log.puts).toEqual([]);
});

test("Save refuses unapplied Raw Markdown instead of discarding it", async ({ page }) => {
  action("save");
  const github = await openEditor(page);
  await loadRecipe(page, FIRST);
  await page.getByRole("tab", { name: "Markdown" }).click();
  const edited = `${recipeMarkdown(FIRST)}\n\n## Notes\n\n- typed in the raw editor`;
  await rawMarkdown(page).fill(edited);
  await saveButton(page).click();
  await expect(validation(page)).toBeFocused();
  await expect(validation(page)).toContainText("Raw Markdown has edits that are not applied yet. Apply Markdown before saving.");
  await expect(rawMarkdown(page)).toHaveValue(edited);
  expect(github.log.puts).toEqual([]);
  await page.getByRole("button", { name: "Apply Markdown" }).click();
  await saveButton(page).click();
  await expect(status(page)).toHaveText("Recipe saved to GitHub.");
  expect(github.log.puts.at(-1).content).toContain("typed in the raw editor");
});

test("Save with validation errors writes nothing and shows the findings", async ({ page }) => {
  action("save");
  const github = await openEditor(page);
  await saveButton(page).click();
  await expect(validation(page)).toBeFocused();
  await expect(validation(page)).toContainText("Recipe title is required.");
  expect(github.log.puts).toEqual([]);
});

// --- ULI-A08: keyboard; reduced motion ---------------------------------------

test("primary actions are reachable by keyboard", async ({ page }) => {
  annotate("uli-surface", "editor");
  await openEditor(page);
  await recordTabSequence(page, 22);
  for (const [role, name] of [["textbox", "Owner"], ["button", "Connect"], ["button", "Reload Recipes"], ["button", "New Recipe"], ["textbox", "Search"], ["tab", "Structured"]]) {
    expect(await wasFocusedDuringSequence(page.getByRole(role, { name, exact: true }).first()), name).toBe(true);
  }
});

test("reduced motion removes button transitions", async ({ page }) => {
  annotate("uli-surface", "editor");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openEditor(page);
  await expect.poll(() => page.getByRole("button", { name: "Connect" }).evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
});
