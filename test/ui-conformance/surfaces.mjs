// Declared conformance inventory for visual-engineering/UI-LAYOUT-INTERACTION@1.0.0
// (pinned at visual-engineering 8da8fbc). This file is data: the route, every
// enabled action on it and every alignment group the composition intends.
// The suite fails when the page renders an enabled action that is not
// declared here, so new controls cannot ship without a contract (ULI-A10).
import { readFileSync } from "node:fs";

export const STANDARD = Object.freeze({ id: "visual-engineering/UI-LAYOUT-INTERACTION", version: "1.0.0", source: "kemiller2002/visual-engineering@8da8fbc" });
export const REPOSITORY = "kemiller2002/recipe-formatter";
export const CLASSIFICATION = "app-ui";
export const HELPERS = "@echelon-foundry/forma-conformance 0.1.0 vendored from kemiller2002/forma@769fa13 (Forma PR #158)";

// The editor lists recipes from the same taxonomy file the page falls back to.
export const TAXONOMY_TEXT = readFileSync(new URL("../../pilot-data/recipe-taxonomy.json", import.meta.url), "utf8");
const TAXONOMY = JSON.parse(TAXONOMY_TEXT);

export const RECIPES = Object.freeze(Object.values(TAXONOMY.categories)
  .flatMap(group => Object.values(group))
  .flatMap(category => category.classes.flatMap(recipeClass => recipeClass.recipes.map(recipe => ({ ...recipe, categorySlug: category.slug, classSlug: recipeClass.slug }))))
  .sort((a, b) => a.recipeName.localeCompare(b.recipeName, undefined, { sensitivity: "base" })));

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const recipeItemName = recipe => new RegExp(`^${escape(recipe.recipeName)} ${escape(recipe.personName)} · ${escape(recipe.className)}$`);

const button = name => ({ role: "button", name });
const textbox = name => ({ role: "textbox", name });
const combobox = name => ({ role: "combobox", name });
const tab = name => ({ role: "tab", name });

const action = (id, control, intent, expectedOutcome, resetStrategy) => ({ id, control, intent, expectedOutcome, ...(resetStrategy ? { resetStrategy } : {}) });

const RESET = "Reload the page; every GitHub request is intercepted, so nothing persists outside the browser session";

export const EDITOR_ACTIONS = Object.freeze([
  action("connect", button("Connect"), "Check the configured repository and branch on GitHub", "Status reads \"Connected to owner/repo on branch\"; a failed lookup reports the HTTP status and never claims a connection", RESET),
  action("reload-recipes", button("Reload Recipes"), "Reload the recipe taxonomy", "Status shows progress, then where the taxonomy came from; when every source fails the status reports the failure", RESET),
  action("new-recipe", button("New Recipe"), "Start a new local recipe", "Editor heading becomes \"New local recipe\" and the loaded recipe's fields are cleared", RESET),
  action("search", textbox("Search"), "Filter the recipe list by text", "The recipe count and list show only matching recipes", RESET),
  action("filter-person", combobox("Person"), "Filter the recipe list by person", "Only that person's recipes are listed", RESET),
  action("filter-category", combobox("Category"), "Filter the recipe list by category", "Only recipes in the category are listed; an empty match shows the empty state", RESET),
  action("filter-class", combobox("Class"), "Filter the recipe list by class", "Only recipes in the class are listed", RESET),
  ...RECIPES.map(recipe => action(`open-${recipe.recipeSlug}`, button(recipeItemName(recipe)), `Load ${recipe.recipeName} from GitHub`, `Editor heading becomes "${recipe.recipeName}", fields hold the file's content, the list item is current and the status reports the load`, RESET)),
  action("tab-structured", tab("Structured"), "Show the structured editor", "The Structured tab is selected and its panel is the only one shown"),
  action("tab-markdown", tab("Markdown"), "Show the raw Markdown editor", "The Markdown tab is selected and the raw Markdown reflects the structured fields"),
  action("tab-preview", tab("Preview"), "Show the preview", "The Preview tab is selected and the preview shows the current title"),
  action("edit-title", textbox("Title"), "Edit the recipe title", "The raw Markdown, preview and inferred recipe ID follow the title"),
  action("add-sub-recipe", button("Add Sub Recipe"), "Add a sub recipe card", "A card named \"Sub Recipe N\" appears with its fields", RESET),
  action("card-move-up", button(/^Move .+ up$/), "Move a sub recipe or optional section earlier", "The card order changes; the first card's Up is disabled", RESET),
  action("card-move-down", button(/^Move .+ down$/), "Move a sub recipe or optional section later", "The card order changes; the last card's Down is disabled", RESET),
  action("card-remove", button(/^Remove .+$/), "Remove a sub recipe or optional section", "The card is removed and the empty state returns when none are left", RESET),
  action("add-section", button("Add Section"), "Add an optional section card", "A card named \"Optional Section N\" appears with its fields", RESET),
  action("apply-markdown", button("Apply Markdown"), "Parse the raw Markdown into the structured fields", "Structured fields show the Markdown's values and the unapplied-edits error clears", RESET),
  action("revert-markdown", button("Revert to Loaded"), "Discard Markdown changes back to the version loaded from GitHub", "The raw Markdown equals the loaded file again and the badge reads \"Matches GitHub\"; disabled with an explanation when nothing was loaded", RESET),
  action("validate", button("Validate"), "Validate the recipe", "Findings are listed in the validation region, which receives focus", RESET),
  action("save", button("Save to GitHub"), "Commit the recipe Markdown to GitHub", "While pending the button is disabled and busy; on success the PUT carries exactly the shown Markdown and the status reads \"Recipe saved to GitHub.\"; on failure or conflict the error is shown, the edits are kept and Save can be retried", RESET)
]);

const tabpanel = "Structured";

export const SURFACES = Object.freeze([
  {
    id: "editor",
    path: "/",
    kind: "editor",
    actions: EDITOR_ACTIONS,
    groups: [
      { id: "connection-row", ruleId: "ULI-L01", edge: "top", widths: [768, 1280], scope: "banner", peers: [textbox("Owner"), textbox("Repository"), textbox("Branch")], rationale: "Connection fields share one row" },
      { id: "connection-row-height", ruleId: "ULI-L02", edge: "bottom", widths: [768, 1280], scope: "banner", peers: [textbox("Owner"), textbox("Repository"), textbox("Branch")], rationale: "Connection fields have one control height" },
      { id: "connection-stack", ruleId: "ULI-L09", edge: "left", widths: [320, 390], scope: "banner", peers: [textbox("Owner"), textbox("Repository"), textbox("Branch"), textbox("Session Token")], rationale: "Connection fields stack on one left edge on narrow screens" },
      { id: "connection-actions-row", ruleId: "ULI-L10", edge: "center", widths: [1280], scope: "banner", peers: [button("Connect"), button("Reload Recipes")], rationale: "Connection actions share one row" },
      { id: "connection-actions-stack", ruleId: "ULI-L10", edge: "left", widths: [320, 390, 768], scope: "banner", peers: [button("Connect"), button("Reload Recipes")], rationale: "Connection actions stack as full-width peers at and below 820px" },
      { id: "connection-actions-stack-width", ruleId: "ULI-L02", edge: "right", widths: [320, 390, 768], scope: "banner", peers: [button("Connect"), button("Reload Recipes")], rationale: "Stacked connection actions have one width" },
      { id: "library-filters", ruleId: "ULI-L01", edge: "left", widths: [320, 390, 768, 1280], scope: "complementary", peers: [textbox("Search"), combobox("Person"), combobox("Category"), combobox("Class")], rationale: "Search and filters stack on one left edge" },
      { id: "library-filters-width", ruleId: "ULI-L02", edge: "right", widths: [320, 390, 768, 1280], scope: "complementary", peers: [textbox("Search"), combobox("Person"), combobox("Category"), combobox("Class")], rationale: "Search and filters have one width" },
      { id: "identity-row", ruleId: "ULI-L01", edge: "top", widths: [768], scope: tabpanel, peers: [textbox("Title"), textbox("Recipe ID"), combobox("Person / Entrant")], rationale: "Title, recipe ID and entrant share the first metadata row" },
      { id: "entrant-row", ruleId: "ULI-L01", edge: "top", widths: [1280], scope: tabpanel, peers: [textbox("Recipe ID"), combobox("Person / Entrant")], rationale: "Recipe ID and entrant share a metadata row beside the wide title" },
      { id: "classification-row", ruleId: "ULI-L01", edge: "top", widths: [768, 1280], scope: tabpanel, peers: [textbox("Entry Number"), combobox("Category"), combobox("Class")], rationale: "Entry number, category and class share a row although inputs and selects differ" },
      { id: "classification-row-height", ruleId: "ULI-L02", edge: "bottom", widths: [768, 1280], scope: tabpanel, peers: [textbox("Entry Number"), combobox("Category"), combobox("Class")], rationale: "Text inputs and selects have one control height" },
      { id: "status-row", ruleId: "ULI-L01", edge: "top", widths: [768], scope: tabpanel, peers: [textbox("Status"), textbox("Tags"), textbox("Description")], rationale: "Status and tags align with the taller description field in their row" },
      { id: "status-row-height", ruleId: "ULI-L02", edge: "bottom", widths: [768, 1280], scope: tabpanel, peers: [textbox("Status"), textbox("Tags")], rationale: "Status and tags keep their intrinsic height next to a taller neighbour" },
      { id: "timing-row", ruleId: "ULI-L01", edge: "top", widths: [768], scope: tabpanel, peers: [textbox("Servings / Yield"), textbox("Prep Time"), textbox("Cook Time")], rationale: "Timing fields share a row" },
      { id: "timing-row-wide", ruleId: "ULI-L01", edge: "top", widths: [1280], scope: tabpanel, peers: [textbox("Servings / Yield"), textbox("Prep Time"), textbox("Cook Time"), textbox("Total Time")], rationale: "All four timing fields share a row" },
      { id: "fields-stack", ruleId: "ULI-L09", edge: "left", widths: [320, 390], scope: tabpanel, peers: [textbox("Title"), textbox("Recipe ID"), combobox("Person / Entrant"), textbox("Entry Number"), combobox("Category"), combobox("Class")], rationale: "Metadata fields stack on one left edge on narrow screens" },
      { id: "review-actions", ruleId: "ULI-L10", edge: "center", widths: [390, 768, 1280], peers: [button("Validate"), button("Save to GitHub")], rationale: "Validate and Save share one row in source order" },
      { id: "review-actions-height", ruleId: "ULI-L02", edge: "bottom", widths: [390, 768, 1280], peers: [button("Validate"), button("Save to GitHub")], rationale: "Validate and Save have one intrinsic height" }
    ]
  }
]);

export const UNKNOWN_SCOPE = Object.freeze([
  "GitHub is never contacted: api.github.com and raw.githubusercontent.com are intercepted with fixtures, so real authentication, rate limits, permissions and the content repository's layout are not verified.",
  "Translated and right-to-left text are not exercised (the editor ships English only).",
  "Browser page zoom is approximated by the contract widths plus a 200% default text size; WebKit and Firefox are not exercised.",
  "window.confirm prompts (discard unsaved changes, restore a session draft) are accepted or dismissed by the test; their native presentation is not measured."
]);

export const SURFACE_UNKNOWN = Object.freeze({});
