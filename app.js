const TAXONOMY_GITHUB_BLOB_URL =
  "https://github.com/kemiller2002/culinary-arts-2026-state-fair/blob/main/html/metadata/recipe-taxonomy.json";
const TAXONOMY_FALLBACK_PATH = "./pilot-data/recipe-taxonomy.json";
const DEFAULT_GITHUB_OWNER = "kemiller2002";
const DEFAULT_GITHUB_REPO = "culinary-arts-2026-state-fair";
const DEFAULT_GITHUB_BRANCH = "main";
const RECIPE_CONTENT_ROOTS = ["culinary/entries", "html"];
const SETTINGS_KEY = "recipeEditorRepoSettings";
const DRAFT_PREFIX = "recipeEditorDraft";
const MODE_TABS = ["structured", "markdown", "preview"];

const LOGICAL_FIELDS = {
  id: ["id"],
  title: ["title"],
  person: ["person", "entrant"],
  entryNumber: ["entry_number"],
  category: ["category"],
  recipeClass: ["class", "class_name"],
  classNumber: ["class_number"],
  description: ["description"],
  servings: ["servings", "yield"],
  prepTime: ["prepTime", "prep_time"],
  cookTime: ["cookTime", "cook_time"],
  totalTime: ["totalTime", "total_time"],
  status: ["status"],
  tags: ["tags"],
};

const state = {
  metadata: {
    people: [],
    categories: [],
    recipes: [],
    categoriesBySlug: new Map(),
    classesBySlug: new Map(),
    recipesByPath: new Map(),
  },
  repo: {
    owner: "",
    repo: "",
    branch: "main",
    token: "",
  },
  filters: {
    search: "",
    person: "",
    category: "",
    recipeClass: "",
  },
  ui: {
    tab: "structured",
    connectionStatus: "Not connected",
    connectionTone: "warning",
    saveState: "local",
    selectedRecipePath: "",
    isLoadingRecipe: false,
    isSaving: false,
  },
  editor: createEmptyEditor(),
};

const $ = (id) => document.getElementById(id);

function createEmptyEditor() {
  return {
    recipePath: "",
    source: "new",
    displayName: "New local recipe",
    loadedSha: "",
    loadedMarkdown: "",
    rawMarkdown: "",
    frontmatter: {},
    mainIngredients: "",
    mainSteps: "",
    subRecipes: [],
    assembly: "",
    notes: "",
    optionalSections: [],
    unknownSections: [],
    validation: [],
    dirty: false,
  };
}

function clean(value) {
  return (value || "").trim();
}

function isBlank(value) {
  return clean(value) === "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureList(value) {
  const lines = clean(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "- ";

  return lines
    .map((line) => (line.startsWith("-") ? line : `- ${line}`))
    .join("\n");
}

function ensureSteps(value) {
  const lines = clean(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "1. ";

  return lines
    .map((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s*/, "")}`)
    .join("\n");
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function githubBlobUrlToRawUrl(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== "github.com") {
      return url;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);

    if (parts.length < 5 || parts[2] !== "blob") {
      return url;
    }

    const [owner, repo, , branch, ...pathParts] = parts;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathParts.join("/")}`;
  } catch {
    return url;
  }
}

function normalizeRecipeRepoPath(path) {
  const trimmed = clean(path).replace(/^\/+/, "");

  if (!trimmed) return "";

  for (const root of RECIPE_CONTENT_ROOTS) {
    if (trimmed.startsWith(`${root}/`)) {
      return trimmed;
    }
  }

  return `${RECIPE_CONTENT_ROOTS[0]}/${trimmed}`;
}

function candidateRecipeRepoPaths(path) {
  const trimmed = clean(path).replace(/^\/+/, "");

  if (!trimmed) return [];

  const candidates = [trimmed];

  RECIPE_CONTENT_ROOTS.forEach((root) => {
    if (!trimmed.startsWith(`${root}/`)) {
      candidates.push(`${root}/${trimmed}`);
    }
  });

  return Array.from(new Set(candidates));
}

function buildRawGithubUrl(path) {
  return `https://raw.githubusercontent.com/${state.repo.owner}/${state.repo.repo}/${state.repo.branch}/${path}`;
}

function getLogicalField(key) {
  const aliases = LOGICAL_FIELDS[key] || [key];

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(state.editor.frontmatter, alias)) {
      return state.editor.frontmatter[alias];
    }
  }

  return "";
}

function setLogicalField(key, value) {
  const aliases = LOGICAL_FIELDS[key] || [key];
  const existingKey =
    aliases.find((alias) =>
      Object.prototype.hasOwnProperty.call(state.editor.frontmatter, alias),
    ) || aliases[0];

  aliases.forEach((alias) => {
    if (alias !== existingKey) {
      delete state.editor.frontmatter[alias];
    }
  });

  if (Array.isArray(value)) {
    state.editor.frontmatter[existingKey] = value;
    return;
  }

  const stringValue = String(value ?? "");

  if (!isBlank(stringValue)) {
    state.editor.frontmatter[existingKey] = stringValue;
    return;
  }

  delete state.editor.frontmatter[existingKey];
}

function flattenMetadata(metadata) {
  const people = metadata.people || [];
  const categories = [];
  const classes = [];
  const recipes = [];

  Object.entries(metadata.categories || {}).forEach(([groupName, groupCategories]) => {
    Object.entries(groupCategories).forEach(([categoryName, category]) => {
      const categoryRecord = {
        groupName,
        categoryName,
        slug: category.slug || slugify(categoryName),
        label: `${groupName} / ${categoryName}`,
        classes: [],
      };

      (category.classes || []).forEach((recipeClass) => {
        const classRecord = {
          categorySlug: categoryRecord.slug,
          slug: recipeClass.slug || String(recipeClass.classNumber || ""),
          name: recipeClass.name,
          classNumber: recipeClass.classNumber || "",
          label: recipeClass.classNumber
            ? `${recipeClass.classNumber} - ${recipeClass.name}`
            : recipeClass.name,
          recipes: [],
        };

        (recipeClass.recipes || []).forEach((recipe) => {
          const recipeRecord = {
            path: recipe.recipePath,
            title: recipe.recipeName,
            personId: recipe.personId,
            personName: recipe.personName,
            categorySlug: categoryRecord.slug,
            categoryName,
            classSlug: classRecord.slug,
            className: classRecord.name,
            classNumber: classRecord.classNumber,
            recipeSlug: recipe.recipeSlug,
            filename: recipe.recipePath.split("/").slice(-2, -1)[0] || "recipe",
          };

          classRecord.recipes.push(recipeRecord);
          recipes.push(recipeRecord);
        });

        categoryRecord.classes.push(classRecord);
        classes.push(classRecord);
      });

      categories.push(categoryRecord);
    });
  });

  state.metadata.people = people;
  state.metadata.categories = categories;
  state.metadata.recipes = recipes.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
  state.metadata.categoriesBySlug = new Map(categories.map((item) => [item.slug, item]));
  state.metadata.classesBySlug = new Map(classes.map((item) => [item.slug, item]));
  state.metadata.recipesByPath = new Map(recipes.map((item) => [item.path, item]));
}

async function loadMetadata() {
  const remoteUrl = githubBlobUrlToRawUrl(TAXONOMY_GITHUB_BLOB_URL);

  try {
    const response = await fetch(remoteUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Remote taxonomy fetch failed: ${response.status}`);
    }

    flattenMetadata(await response.json());
    populateMetadataControls();
    renderRecipeList();
    setConnectionStatus("Recipe taxonomy loaded from GitHub.", "ready");
    return;
  } catch (error) {
    console.error("Remote taxonomy load failed", error);
  }

  const fallbackResponse = await fetch(TAXONOMY_FALLBACK_PATH);

  if (!fallbackResponse.ok) {
    throw new Error(`Fallback taxonomy fetch failed: ${fallbackResponse.status}`);
  }

  flattenMetadata(await fallbackResponse.json());
  populateMetadataControls();
  renderRecipeList();
  setConnectionStatus("Using local fallback taxonomy data.", "warning");
}

function populateSelect(selectId, options, placeholder, valueKey = "value", labelKey = "label") {
  const select = $(selectId);
  const currentValue = select.value;

  select.innerHTML = "";

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = placeholder;
  select.appendChild(blank);

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option[valueKey];
    element.textContent = option[labelKey];
    select.appendChild(element);
  });

  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function populateMetadataControls() {
  populateSelect(
    "person",
    state.metadata.people.map((person) => ({
      value: person.id,
      label: person.name,
    })),
    "Select a person",
  );

  populateSelect(
    "category",
    state.metadata.categories.map((category) => ({
      value: category.slug,
      label: category.label,
    })),
    "Select a category",
  );

  populateSelect(
    "filterPerson",
    state.metadata.people.map((person) => ({
      value: person.id,
      label: person.name,
    })),
    "All people",
  );

  populateSelect(
    "filterCategory",
    state.metadata.categories.map((category) => ({
      value: category.slug,
      label: category.label,
    })),
    "All categories",
  );

  populateSelect(
    "filterClass",
    [...state.metadata.classesBySlug.values()].map((recipeClass) => ({
      value: recipeClass.slug,
      label: recipeClass.label,
    })),
    "All classes",
  );

  updateClassOptions();
}

function updateClassOptions() {
  const categorySlug = clean($("category").value) || getLogicalField("category");
  const classes = categorySlug
    ? state.metadata.categoriesBySlug.get(categorySlug)?.classes || []
    : [...state.metadata.classesBySlug.values()];

  const currentValue = $("recipeClass").value || getLogicalField("recipeClass");

  populateSelect(
    "recipeClass",
    classes.map((item) => ({
      value: item.slug,
      label: item.label,
    })),
    categorySlug ? "Select a class" : "Select a category",
  );

  if ([...$("recipeClass").options].some((option) => option.value === currentValue)) {
    $("recipeClass").value = currentValue;
  }
}

function renderRecipeList() {
  const container = $("recipeList");
  const filtered = state.metadata.recipes.filter((recipe) => {
    const query = state.filters.search.toLowerCase();
    const matchesQuery =
      !query ||
      recipe.title.toLowerCase().includes(query) ||
      recipe.filename.toLowerCase().includes(query) ||
      recipe.path.toLowerCase().includes(query) ||
      recipe.personName.toLowerCase().includes(query);

    return (
      matchesQuery &&
      (!state.filters.person || recipe.personId === state.filters.person) &&
      (!state.filters.category || recipe.categorySlug === state.filters.category) &&
      (!state.filters.recipeClass || recipe.classSlug === state.filters.recipeClass)
    );
  });

  $("recipeCount").textContent = `${filtered.length} recipe${filtered.length === 1 ? "" : "s"}`;

  if (!filtered.length) {
    container.innerHTML =
      '<div class="empty-state">No recipes match the current search and filters.</div>';
    return;
  }

  container.innerHTML = filtered
    .map((recipe) => {
      const selected = recipe.path === state.ui.selectedRecipePath ? " is-selected" : "";
      return `
        <button type="button" class="recipe-item${selected}" data-recipe-path="${escapeHtml(recipe.path)}">
          <span class="recipe-item-title">${escapeHtml(recipe.title)}</span>
          <span class="recipe-item-meta">${escapeHtml(recipe.personName)} · ${escapeHtml(recipe.className)}</span>
        </button>
      `;
    })
    .join("");
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = {};
  const body = match ? markdown.slice(match[0].length) : markdown;

  if (!match) return { frontmatter, body };

  match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.indexOf(":");

      if (separator === -1) return;

      const key = line.slice(0, separator).trim();
      const rawValue = line.slice(separator + 1).trim();

      if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        frontmatter[key] = rawValue
          .slice(1, -1)
          .split(",")
          .map((item) => item.trim().replace(/^"(.*)"$/, "$1"))
          .filter(Boolean);
        return;
      }

      frontmatter[key] = rawValue.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
    });

  return { frontmatter, body };
}

function splitTopLevelSections(body) {
  const sections = [];
  const titleMatch = body.match(/^# .+\n*/);
  const content = titleMatch ? body.slice(titleMatch[0].length) : body;
  const regex = /^## (.+)$/gm;
  const matches = [...content.matchAll(regex)];

  if (!matches.length) return sections;

  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : content.length;
    sections.push({
      title: match[1].trim(),
      content: content.slice(start, end).trim(),
    });
  });

  return sections;
}

function extractSubSection(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`### ${escaped}\\n\\n([\\s\\S]*?)(?=\\n### |$)`));
  return match ? match[1].trim() : "";
}

function parseMarkdown(markdown) {
  const { frontmatter, body } = parseFrontmatter(markdown);
  const sections = splitTopLevelSections(body);
  const editor = createEmptyEditor();

  editor.frontmatter = frontmatter;

  sections.forEach((section) => {
    if (section.title === "Main Recipe") {
      editor.mainIngredients = extractSubSection(section.content, "Ingredients");
      editor.mainSteps = extractSubSection(section.content, "Steps");
      return;
    }

    if (section.title === "Ingredients") {
      editor.mainIngredients = section.content;
      return;
    }

    if (section.title === "Instructions" || section.title === "Steps") {
      editor.mainSteps = section.content;
      return;
    }

    if (section.title === "Assembly") {
      editor.assembly = section.content;
      return;
    }

    if (section.title === "Notes") {
      editor.notes = section.content;
      return;
    }

    const hasRecipeShape =
      section.content.includes("### Ingredients") && section.content.includes("### Steps");

    if (hasRecipeShape) {
      editor.subRecipes.push({
        name: section.title,
        ingredients: extractSubSection(section.content, "Ingredients"),
        steps: extractSubSection(section.content, "Steps"),
      });
      return;
    }

    editor.optionalSections.push({
      title: section.title,
      content: section.content,
    });
  });

  return editor;
}

function serializeFrontmatter(frontmatter) {
  const keys = Object.keys(frontmatter);

  if (!keys.length) return "";

  return `---\n${keys
    .map((key) => {
      const value = frontmatter[key];

      if (Array.isArray(value)) {
        return `${key}: [${value.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(", ")}]`;
      }

      return `${key}: ${String(value).includes(":") || String(value).includes('"') ? `"${String(value).replace(/"/g, '\\"')}"` : value}`;
    })
    .join("\n")}\n---\n`;
}

function buildSubRecipesMarkdown() {
  return state.editor.subRecipes
    .map((subRecipe) => `---

## ${subRecipe.name || "Sub Recipe"}

### Ingredients

${ensureList(subRecipe.ingredients)}

### Steps

${ensureSteps(subRecipe.steps)}
`)
    .join("\n");
}

function buildOptionalSectionsMarkdown() {
  return state.editor.optionalSections
    .map((section) => `---

## ${section.title || "Section"}

${clean(section.content)}
`)
    .join("\n");
}

function serializeEditorToMarkdown() {
  const frontmatter = { ...state.editor.frontmatter };
  const title = getLogicalField("title") || "Recipe Name";
  const sections = [];

  if (clean(state.editor.mainIngredients) || clean(state.editor.mainSteps)) {
    sections.push(`## Main Recipe

### Ingredients

${ensureList(state.editor.mainIngredients)}

### Steps

${ensureSteps(state.editor.mainSteps)}`);
  }

  const subRecipes = buildSubRecipesMarkdown();

  if (subRecipes) {
    sections.push(subRecipes.trim());
  }

  if (clean(state.editor.assembly)) {
    sections.push(`## Assembly

${ensureSteps(state.editor.assembly)}`);
  }

  const optionalSections = buildOptionalSectionsMarkdown();

  if (optionalSections) {
    sections.push(optionalSections.trim());
  }

  if (clean(state.editor.notes)) {
    sections.push(`## Notes

${ensureList(state.editor.notes)}`);
  }

  return `${serializeFrontmatter(frontmatter)}
# ${title}

${sections.join("\n\n---\n\n")}
`.trimEnd();
}

function syncEditorToMarkdown() {
  state.editor.rawMarkdown = serializeEditorToMarkdown();
}

function applyStructuredFormToState() {
  setLogicalField("title", $("title").value);
  setLogicalField("id", $("recipeId").value);
  setLogicalField("person", $("person").value);
  setLogicalField("entryNumber", $("entryNumber").value);
  setLogicalField("category", $("category").value);
  setLogicalField("recipeClass", $("recipeClass").value);
  const classRecord = state.metadata.classesBySlug.get(clean($("recipeClass").value));
  setLogicalField("classNumber", classRecord?.classNumber || "");
  setLogicalField("description", $("description").value);
  setLogicalField("servings", $("servings").value);
  setLogicalField("prepTime", $("prepTime").value);
  setLogicalField("cookTime", $("cookTime").value);
  setLogicalField("totalTime", $("totalTime").value);
  setLogicalField("status", $("status").value);
  setLogicalField(
    "tags",
    clean($("tags").value)
      ? $("tags")
          .value.split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  );

  state.editor.mainIngredients = $("mainIngredients").value;
  state.editor.mainSteps = $("mainSteps").value;
  state.editor.assembly = $("assembly").value;
  state.editor.notes = $("notes").value;
  state.editor.recipePath = $("recipePath").value;

  syncEditorToMarkdown();
}

function applyStateToStructuredForm() {
  $("title").value = getLogicalField("title");
  $("recipeId").value = getLogicalField("id");
  $("person").value = getLogicalField("person");
  $("entryNumber").value = getLogicalField("entryNumber");
  $("category").value = getLogicalField("category");
  updateClassOptions();
  $("recipeClass").value = getLogicalField("recipeClass");
  $("description").value = getLogicalField("description");
  $("servings").value = getLogicalField("servings");
  $("prepTime").value = getLogicalField("prepTime");
  $("cookTime").value = getLogicalField("cookTime");
  $("totalTime").value = getLogicalField("totalTime");
  $("status").value = getLogicalField("status");
  $("tags").value = Array.isArray(getLogicalField("tags"))
    ? getLogicalField("tags").join(", ")
    : getLogicalField("tags");
  $("mainIngredients").value = state.editor.mainIngredients;
  $("mainSteps").value = state.editor.mainSteps;
  $("assembly").value = state.editor.assembly;
  $("notes").value = state.editor.notes;
  $("recipePath").value = state.editor.recipePath;
  renderSubRecipes();
  renderOptionalSections();
}

function renderSubRecipes() {
  const container = $("subRecipes");

  if (!state.editor.subRecipes.length) {
    container.innerHTML =
      '<div class="empty-state">No sub recipes yet. Add one when the recipe has components.</div>';
    return;
  }

  container.innerHTML = state.editor.subRecipes
    .map(
      (subRecipe, index) => `
        <div class="stack-card" data-sub-index="${index}">
          <div class="stack-card-head">
            <strong>${escapeHtml(subRecipe.name || `Sub Recipe ${index + 1}`)}</strong>
            <div class="stack-actions">
              <button type="button" class="secondary" data-sub-action="up" data-sub-index="${index}">Up</button>
              <button type="button" class="secondary" data-sub-action="down" data-sub-index="${index}">Down</button>
              <button type="button" class="secondary" data-sub-action="remove" data-sub-index="${index}">Remove</button>
            </div>
          </div>

          <label>
            Name
            <input data-sub-field="name" data-sub-index="${index}" value="${escapeHtml(subRecipe.name)}" />
          </label>

          <label>
            Ingredients
            <textarea data-sub-field="ingredients" data-sub-index="${index}">${escapeHtml(subRecipe.ingredients)}</textarea>
          </label>

          <label>
            Steps
            <textarea data-sub-field="steps" data-sub-index="${index}">${escapeHtml(subRecipe.steps)}</textarea>
          </label>
        </div>
      `,
    )
    .join("");
}

function renderOptionalSections() {
  const container = $("optionalSections");

  if (!state.editor.optionalSections.length) {
    container.innerHTML =
      '<div class="empty-state">No optional sections yet. Add presentation, storage, source, or another custom block as needed.</div>';
    return;
  }

  container.innerHTML = state.editor.optionalSections
    .map(
      (section, index) => `
        <div class="stack-card" data-optional-index="${index}">
          <div class="stack-card-head">
            <strong>${escapeHtml(section.title || `Optional Section ${index + 1}`)}</strong>
            <div class="stack-actions">
              <button type="button" class="secondary" data-optional-action="up" data-optional-index="${index}">Up</button>
              <button type="button" class="secondary" data-optional-action="down" data-optional-index="${index}">Down</button>
              <button type="button" class="secondary" data-optional-action="remove" data-optional-index="${index}">Remove</button>
            </div>
          </div>

          <label>
            Section Title
            <input data-optional-field="title" data-optional-index="${index}" value="${escapeHtml(section.title)}" />
          </label>

          <label>
            Content
            <textarea data-optional-field="content" data-optional-index="${index}">${escapeHtml(section.content)}</textarea>
          </label>
        </div>
      `,
    )
    .join("");
}

function setConnectionStatus(text, tone = "warning") {
  state.ui.connectionStatus = text;
  state.ui.connectionTone = tone;
  const element = $("connectionStatus");
  element.textContent = text;
  element.className = "status-line";
  element.dataset.tone = tone;
}

function setSaveState(label, tone = "warning") {
  const badge = $("saveStateBadge");
  badge.textContent = label;
  badge.dataset.tone = tone;
}

function renderHeaderState() {
  const isExisting = state.editor.source === "existing";
  $("editingModeLabel").textContent = isExisting
    ? "Editing existing recipe"
    : "Working on new recipe";
  $("editingRecipeName").textContent = state.editor.displayName;
  $("editingBanner").hidden = false;
  $("editorTitle").textContent = state.editor.displayName;
  $("selectedPath").textContent = state.editor.recipePath || "No path selected";
  setSaveState(
    state.ui.isSaving
      ? "Saving"
      : state.editor.dirty
        ? "Edited locally"
        : state.editor.loadedSha
          ? "Matches GitHub"
          : "Local draft",
    state.ui.isSaving ? "warning" : state.editor.dirty ? "warning" : "ready",
  );
}

function inferRecipePath() {
  if (clean(state.editor.recipePath)) return clean(state.editor.recipePath);

  const categorySlug = getLogicalField("category");
  const classSlug = getLogicalField("recipeClass");
  const person = getLogicalField("person");
  const recipeId = getLogicalField("id") || slugify(getLogicalField("title"));

  if (!(categorySlug && classSlug && person && recipeId)) return "";

  const category = state.metadata.categoriesBySlug.get(categorySlug);
  const groupSlug = category?.groupName ? slugify(category.groupName) : "recipes";

  return `${groupSlug}/${categorySlug}/${classSlug}/${person}/${recipeId}/recipe.md`;
}

function defaultCommitMessage() {
  const slug = getLogicalField("id") || slugify(getLogicalField("title")) || "recipe";
  return state.editor.source === "existing" ? `recipe: update ${slug}` : `recipe: add ${slug}`;
}

function renderPreview() {
  const title = getLogicalField("title") || "Untitled recipe";
  const tags = getLogicalField("tags");
  const tagList = Array.isArray(tags) ? tags : clean(tags) ? String(tags).split(",") : [];
  const preview = $("previewContent");

  preview.innerHTML = `
    <section class="preview-section">
      <h3>${escapeHtml(title)}</h3>
      <ul class="preview-meta">
        <li>Person: ${escapeHtml(getLogicalField("person") || "Not set")}</li>
        <li>Category: ${escapeHtml(getLogicalField("category") || "Not set")}</li>
        <li>Class: ${escapeHtml(getLogicalField("recipeClass") || "Not set")}</li>
        <li>Status: ${escapeHtml(getLogicalField("status") || "draft")}</li>
        <li>Tags: ${escapeHtml(tagList.join(", ") || "None")}</li>
      </ul>
    </section>

    <section class="preview-section">
      <h3>Main Ingredients</h3>
      <div class="preview-text">${escapeHtml(ensureList(state.editor.mainIngredients))}</div>
    </section>

    <section class="preview-section">
      <h3>Main Steps</h3>
      <div class="preview-text">${escapeHtml(ensureSteps(state.editor.mainSteps))}</div>
    </section>

    <section class="preview-section">
      <h3>Assembly</h3>
      <div class="preview-text">${escapeHtml(ensureSteps(state.editor.assembly))}</div>
    </section>

    <section class="preview-section">
      <h3>Notes</h3>
      <div class="preview-text">${escapeHtml(ensureList(state.editor.notes))}</div>
    </section>
  `;

  state.editor.subRecipes.forEach((subRecipe) => {
    preview.insertAdjacentHTML(
      "beforeend",
      `
        <section class="preview-section">
          <h3>${escapeHtml(subRecipe.name || "Sub Recipe")}</h3>
          <div class="preview-text">${escapeHtml(ensureList(subRecipe.ingredients))}</div>
          <div class="preview-text">${escapeHtml(ensureSteps(subRecipe.steps))}</div>
        </section>
      `,
    );
  });

  state.editor.optionalSections.forEach((section) => {
    preview.insertAdjacentHTML(
      "beforeend",
      `
        <section class="preview-section">
          <h3>${escapeHtml(section.title || "Section")}</h3>
          <div class="preview-text">${escapeHtml(section.content || "")}</div>
        </section>
      `,
    );
  });
}

function buildDiff(oldText, newText) {
  if (oldText === newText) return "No content changes.";

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  let prefix = 0;
  let suffix = 0;

  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  while (
    suffix + prefix < oldLines.length &&
    suffix + prefix < newLines.length &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const output = [];

  oldLines.slice(Math.max(0, prefix - 2), prefix).forEach((line) => output.push(`  ${line}`));
  oldLines
    .slice(prefix, oldLines.length - suffix)
    .forEach((line) => output.push(`- ${line}`));
  newLines
    .slice(prefix, newLines.length - suffix)
    .forEach((line) => output.push(`+ ${line}`));
  newLines
    .slice(newLines.length - Math.max(0, suffix), newLines.length)
    .slice(0, 2)
    .forEach((line) => output.push(`  ${line}`));

  return output.join("\n");
}

function validateEditor() {
  const results = [];

  if (!clean(getLogicalField("title"))) {
    results.push({
      severity: "error",
      field: "title",
      description: "Recipe title is required.",
    });
  }

  if (!clean(getLogicalField("person"))) {
    results.push({
      severity: "error",
      field: "person",
      description: "Person or entrant is required.",
    });
  }

  if (!clean(state.editor.mainIngredients)) {
    results.push({
      severity: "error",
      field: "mainIngredients",
      description: "Main ingredients cannot be empty.",
    });
  }

  if (!clean(state.editor.mainSteps)) {
    results.push({
      severity: "error",
      field: "mainSteps",
      description: "Main steps cannot be empty.",
    });
  }

  const path = clean($("recipePath").value || inferRecipePath());

  if (!path) {
    results.push({
      severity: "warning",
      field: "recipePath",
      description: "Repository path has not been generated yet.",
    });
  } else if (!/^[a-z0-9/_-]+\.md$/i.test(path)) {
    results.push({
      severity: "error",
      field: "recipePath",
      description: "Repository path must be a safe markdown file path.",
    });
  }

  if (clean(getLogicalField("category")) && clean(getLogicalField("recipeClass"))) {
    const category = state.metadata.categoriesBySlug.get(clean(getLogicalField("category")));
    const matches = category?.classes?.some(
      (recipeClass) => recipeClass.slug === clean(getLogicalField("recipeClass")),
    );

    if (!matches) {
      results.push({
        severity: "error",
        field: "recipeClass",
        description: "Selected class does not belong to the selected category.",
      });
    }
  }

  if (!clean(getLogicalField("id"))) {
    results.push({
      severity: "information",
      field: "recipeId",
      description: "Recipe ID will be suggested from the title during save.",
    });
  }

  state.editor.validation = results;
  renderValidationSummary();
  return results;
}

function renderValidationSummary() {
  const container = $("validationSummary");

  if (!state.editor.validation.length) {
    container.innerHTML = '<div class="validation-item" data-severity="information">No validation findings.</div>';
    return;
  }

  container.innerHTML = state.editor.validation
    .map(
      (item) => `
        <div class="validation-item" data-severity="${item.severity}">
          <strong>${item.severity.toUpperCase()}</strong>
          <div>${escapeHtml(item.description)}</div>
          <small>${escapeHtml(item.field)}</small>
        </div>
      `,
    )
    .join("");
}

function updateDiffOutput() {
  $("diffOutput").textContent = buildDiff(
    state.editor.loadedMarkdown,
    state.editor.rawMarkdown,
  );
}

function renderAll() {
  applyStateToStructuredForm();
  $("rawMarkdown").value = state.editor.rawMarkdown;
  $("recipePath").value = state.editor.recipePath || inferRecipePath();
  if (!clean($("commitMessage").value)) {
    $("commitMessage").value = defaultCommitMessage();
  }
  renderHeaderState();
  renderPreview();
  updateDiffOutput();
  renderValidationSummary();
  renderRecipeList();
}

function markDirty() {
  state.editor.dirty = state.editor.rawMarkdown !== state.editor.loadedMarkdown;
  persistDraft();
  renderHeaderState();
  updateDiffOutput();
}

function draftKey() {
  const repoKey = [state.repo.owner, state.repo.repo, state.repo.branch].join("/");
  const recipeKey = state.editor.recipePath || "new";
  return `${DRAFT_PREFIX}:${repoKey}:${recipeKey}`;
}

function persistDraft() {
  const payload = {
    recipePath: state.editor.recipePath,
    rawMarkdown: state.editor.rawMarkdown,
    loadedMarkdown: state.editor.loadedMarkdown,
    loadedSha: state.editor.loadedSha,
    timestamp: new Date().toISOString(),
  };

  sessionStorage.setItem(draftKey(), JSON.stringify(payload));
}

function clearDraft(path = state.editor.recipePath) {
  const repoKey = [state.repo.owner, state.repo.repo, state.repo.branch].join("/");
  sessionStorage.removeItem(`${DRAFT_PREFIX}:${repoKey}:${path || "new"}`);
}

function restoreDraftIfPresent() {
  const stored = sessionStorage.getItem(draftKey());
  if (!stored) return false;

  try {
    const draft = JSON.parse(stored);

    if (!draft.rawMarkdown || draft.rawMarkdown === state.editor.loadedMarkdown) {
      return false;
    }

    const shouldRestore = window.confirm(
      `A local draft from ${draft.timestamp} exists for this recipe. Restore it?`,
    );

    if (!shouldRestore) return false;

    applyRawMarkdown(draft.rawMarkdown);
    state.editor.loadedSha = draft.loadedSha || state.editor.loadedSha;
    state.editor.loadedMarkdown = draft.loadedMarkdown || state.editor.loadedMarkdown;
    state.editor.dirty = true;
    return true;
  } catch (error) {
    console.error("Unable to restore draft", error);
    return false;
  }
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    state.repo.owner = parsed.owner || DEFAULT_GITHUB_OWNER;
    state.repo.repo = parsed.repo || DEFAULT_GITHUB_REPO;
    state.repo.branch = parsed.branch || DEFAULT_GITHUB_BRANCH;
    state.repo.token = parsed.token || "";
  } catch {
    state.repo.owner = DEFAULT_GITHUB_OWNER;
    state.repo.repo = DEFAULT_GITHUB_REPO;
    state.repo.branch = DEFAULT_GITHUB_BRANCH;
    state.repo.token = "";
  }

  $("githubOwner").value = state.repo.owner;
  $("githubRepo").value = state.repo.repo;
  $("githubBranch").value = state.repo.branch;
  $("githubToken").value = state.repo.token;
}

function saveSettings() {
  state.repo.owner = clean($("githubOwner").value);
  state.repo.repo = clean($("githubRepo").value);
  state.repo.branch = clean($("githubBranch").value) || "main";
  state.repo.token = $("githubToken").value;

  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      owner: state.repo.owner,
      repo: state.repo.repo,
      branch: state.repo.branch,
      token: state.repo.token,
    }),
  );
}

function githubRequest(path, options = {}) {
  const url = new URL(`https://api.github.com${path}`);
  const headers = {
    Accept: "application/vnd.github+json",
    ...(options.headers || {}),
  };

  if (state.repo.token) {
    headers.Authorization = `Bearer ${state.repo.token}`;
  }

  return fetch(url.toString(), {
    ...options,
    headers,
  });
}

const githubService = {
  async connect() {
    saveSettings();

    if (!(state.repo.owner && state.repo.repo && state.repo.branch)) {
      throw new Error("Owner, repository, and branch are required.");
    }

    const [repoResponse, branchResponse] = await Promise.all([
      githubRequest(`/repos/${state.repo.owner}/${state.repo.repo}`),
      githubRequest(
        `/repos/${state.repo.owner}/${state.repo.repo}/branches/${state.repo.branch}`,
      ),
    ]);

    if (!repoResponse.ok) {
      throw new Error(`Repository lookup failed: ${repoResponse.status}`);
    }

    if (!branchResponse.ok) {
      throw new Error(`Branch lookup failed: ${branchResponse.status}`);
    }
  },

  async getRecipe(path) {
    const candidatePaths = candidateRecipeRepoPaths(path);

    let lastStatus = 404;

    for (const candidatePath of candidatePaths) {
      const response = await githubRequest(
        `/repos/${state.repo.owner}/${state.repo.repo}/contents/${candidatePath}?ref=${encodeURIComponent(state.repo.branch)}`,
      );

      if (!response.ok) {
        lastStatus = response.status;
        continue;
      }

      const payload = await response.json();
      return {
        sha: payload.sha,
        path: candidatePath,
        content: decodeBase64Utf8((payload.content || "").replace(/\n/g, "")),
      };
    }

    for (const candidatePath of candidatePaths) {
      const rawResponse = await fetch(buildRawGithubUrl(candidatePath), {
        headers: {
          Accept: "text/plain",
        },
      });

      if (rawResponse.ok) {
        return {
          sha: "",
          path: candidatePath,
          content: await rawResponse.text(),
        };
      }

      lastStatus = rawResponse.status;
    }

    if (lastStatus === 404) {
      throw new Error(
        `Recipe load failed with 404. Tried API first, then raw fallback for: ${candidatePaths.join(" , ")}.`,
      );
    }

    throw new Error(`Recipe load failed: ${lastStatus}`);
  },

  async getLatestFileState(path) {
    try {
      return await this.getRecipe(path);
    } catch (error) {
      if (String(error.message).includes("404")) {
        return null;
      }

      throw error;
    }
  },

  async saveRecipe(path, content, message, sha = "") {
    const repoPath = normalizeRecipeRepoPath(path);
    const response = await githubRequest(
      `/repos/${state.repo.owner}/${state.repo.repo}/contents/${repoPath}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          content: encodeBase64Utf8(content),
          branch: state.repo.branch,
          ...(sha ? { sha } : {}),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }

    const payload = await response.json();
    return payload.content?.sha || payload.commit?.sha || "";
  },
};

async function connectToGithub() {
  setConnectionStatus("Connecting to GitHub...", "warning");

  try {
    await githubService.connect();
    setConnectionStatus(
      `Connected to ${state.repo.owner}/${state.repo.repo} on ${state.repo.branch}`,
      "ready",
    );
  } catch (error) {
    console.error("GitHub connection failed", error);
    setConnectionStatus(error.message, "danger");
  }
}

async function loadExistingRecipe(path) {
  if (state.editor.dirty) {
    const shouldContinue = window.confirm(
      "This recipe has unsaved changes. Discard them and load another recipe?",
    );

    if (!shouldContinue) return;
  }

  const recipe = state.metadata.recipesByPath.get(path);

  if (!recipe) return;

  state.ui.isLoadingRecipe = true;
  state.ui.selectedRecipePath = path;

  try {
    const remote = await githubService.getRecipe(path);
    const parsed = parseMarkdown(remote.content);

    state.editor = {
      ...createEmptyEditor(),
      ...parsed,
      recipePath: remote.path || path,
      source: "existing",
      displayName: recipe.title,
      loadedSha: remote.sha,
      loadedMarkdown: remote.content,
      rawMarkdown: remote.content,
    };

    if (!getLogicalField("person")) {
      setLogicalField("person", recipe.personId);
    }

    if (!getLogicalField("category")) {
      setLogicalField("category", recipe.categorySlug);
    }

    if (!getLogicalField("recipeClass")) {
      setLogicalField("recipeClass", recipe.classSlug);
      setLogicalField("classNumber", recipe.classNumber);
    }

    if (!getLogicalField("title")) {
      setLogicalField("title", recipe.title);
    }

    restoreDraftIfPresent();
    validateEditor();
    renderAll();
  } catch (error) {
    console.error("Recipe load failed", error);
    setConnectionStatus(error.message, "danger");
  } finally {
    state.ui.isLoadingRecipe = false;
  }
}

function startNewRecipe() {
  if (state.editor.dirty) {
    const shouldContinue = window.confirm(
      "This recipe has unsaved changes. Discard them and start a new recipe?",
    );

    if (!shouldContinue) return;
  }

  state.ui.selectedRecipePath = "";
  state.editor = createEmptyEditor();
  state.editor.source = "new";
  state.editor.displayName = "New local recipe";
  setLogicalField("status", "draft");
  syncEditorToMarkdown();
  validateEditor();
  renderAll();
}

function applyRawMarkdown(markdown) {
  const parsed = parseMarkdown(markdown);

  state.editor = {
    ...state.editor,
    ...parsed,
    rawMarkdown: markdown,
  };

  if (!clean(getLogicalField("title"))) {
    setLogicalField("title", state.editor.displayName);
  }

  if (!clean(state.editor.recipePath)) {
    state.editor.recipePath = inferRecipePath();
  }

  validateEditor();
  markDirty();
  renderAll();
}

async function saveRecipe() {
  applyStructuredFormToState();
  state.editor.recipePath = clean($("recipePath").value || inferRecipePath());
  $("recipePath").value = state.editor.recipePath;

  if (!clean(getLogicalField("id"))) {
    setLogicalField("id", slugify(getLogicalField("title")));
  }

  if (!clean(state.editor.recipePath)) {
    state.editor.recipePath = inferRecipePath();
    $("recipePath").value = state.editor.recipePath;
  }

  syncEditorToMarkdown();
  const results = validateEditor();

  if (results.some((item) => item.severity === "error")) {
    renderAll();
    return;
  }

  state.ui.isSaving = true;
  renderHeaderState();

  try {
    const latest = await githubService.getLatestFileState(state.editor.recipePath);
    const commitMessage = clean($("commitMessage").value) || defaultCommitMessage();

    if (state.editor.source === "existing") {
      if (!latest) {
        throw new Error("The remote file no longer exists.");
      }

      if (latest.sha !== state.editor.loadedSha) {
        throw new Error(
          "Remote conflict detected. The GitHub file changed after this editor loaded it.",
        );
      }
    }

    if (state.editor.source === "new" && latest) {
      throw new Error("A file already exists at this path. Change the path before saving.");
    }

    const newSha = await githubService.saveRecipe(
      state.editor.recipePath,
      state.editor.rawMarkdown,
      commitMessage,
      state.editor.source === "existing" ? state.editor.loadedSha : "",
    );

    state.editor.loadedSha = newSha;
    state.editor.loadedMarkdown = state.editor.rawMarkdown;
    state.editor.dirty = false;
    state.editor.source = "existing";
    state.editor.displayName = getLogicalField("title") || state.editor.displayName;
    state.ui.selectedRecipePath = state.editor.recipePath;
    clearDraft();
    setConnectionStatus("Recipe saved to GitHub.", "ready");
    renderRecipeList();
  } catch (error) {
    console.error("Save failed", error);
    setConnectionStatus(error.message, "danger");
  } finally {
    state.ui.isSaving = false;
    renderAll();
  }
}

function handleStructuredChange(event) {
  const changedField = event?.target?.id || "";
  applyStructuredFormToState();

  if (!clean(getLogicalField("id")) && clean(getLogicalField("title"))) {
    setLogicalField("id", slugify(getLogicalField("title")));
  }

  if (changedField === "category") {
    updateClassOptions();
  }

  state.editor.recipePath = clean($("recipePath").value) || inferRecipePath();
  syncEditorToMarkdown();
  validateEditor();
  markDirty();
  $("rawMarkdown").value = state.editor.rawMarkdown;
  $("recipePath").value = state.editor.recipePath;

  if (state.ui.tab === "preview") {
    renderPreview();
  }

  if (!clean($("commitMessage").value)) {
    $("commitMessage").value = defaultCommitMessage();
  }
}

function handleTabChange(tab) {
  state.ui.tab = tab;

  MODE_TABS.forEach((mode) => {
    $(`${mode}Panel`).hidden = mode !== tab;
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });

  if (tab === "preview") {
    renderPreview();
  }
}

function attachEventHandlers() {
  $("connectGithubBtn").addEventListener("click", connectToGithub);
  $("reloadRecipesBtn").addEventListener("click", loadMetadata);
  $("newRecipeBtn").addEventListener("click", startNewRecipe);

  ["githubOwner", "githubRepo", "githubBranch", "githubToken"].forEach((id) => {
    $(id).addEventListener("input", saveSettings);
    $(id).addEventListener("change", saveSettings);
  });

  $("validateBtn").addEventListener("click", () => {
    applyStructuredFormToState();
    validateEditor();
    renderAll();
  });
  $("saveBtn").addEventListener("click", saveRecipe);
  $("applyMarkdownBtn").addEventListener("click", () => {
    applyRawMarkdown($("rawMarkdown").value);
  });
  $("resetMarkdownBtn").addEventListener("click", () => {
    $("rawMarkdown").value = state.editor.loadedMarkdown || state.editor.rawMarkdown;
    applyRawMarkdown($("rawMarkdown").value);
  });

  [
    "title",
    "recipeId",
    "person",
    "entryNumber",
    "category",
    "recipeClass",
    "status",
    "tags",
    "description",
    "servings",
    "prepTime",
    "cookTime",
    "totalTime",
    "mainIngredients",
    "mainSteps",
    "assembly",
    "notes",
    "recipePath",
  ].forEach((id) => {
    $(id).addEventListener("input", handleStructuredChange);
    $(id).addEventListener("change", handleStructuredChange);
  });

  $("recipeSearch").addEventListener("input", (event) => {
    state.filters.search = clean(event.target.value);
    renderRecipeList();
  });
  $("filterPerson").addEventListener("change", (event) => {
    state.filters.person = event.target.value;
    renderRecipeList();
  });
  $("filterCategory").addEventListener("change", (event) => {
    state.filters.category = event.target.value;
    renderRecipeList();
  });
  $("filterClass").addEventListener("change", (event) => {
    state.filters.recipeClass = event.target.value;
    renderRecipeList();
  });

  $("category").addEventListener("change", updateClassOptions);

  $("rawMarkdown").addEventListener("input", () => {
    state.editor.rawMarkdown = $("rawMarkdown").value;
    state.editor.dirty = state.editor.rawMarkdown !== state.editor.loadedMarkdown;
    persistDraft();
    updateDiffOutput();
    renderHeaderState();
  });

  $("addSubRecipeBtn").addEventListener("click", () => {
    state.editor.subRecipes.push({ name: "", ingredients: "", steps: "" });
    syncEditorToMarkdown();
    markDirty();
    renderAll();
  });

  $("addOptionalSectionBtn").addEventListener("click", () => {
    state.editor.optionalSections.push({ title: "", content: "" });
    syncEditorToMarkdown();
    markDirty();
    renderAll();
  });

  $("subRecipes").addEventListener("input", (event) => {
    const index = Number(event.target.dataset.subIndex);
    const field = event.target.dataset.subField;

    if (!Number.isInteger(index) || !field) return;

    state.editor.subRecipes[index][field] = event.target.value;
    syncEditorToMarkdown();
    markDirty();
  });

  $("subRecipes").addEventListener("click", (event) => {
    const button = event.target.closest("[data-sub-action]");
    if (!button) return;

    const index = Number(button.dataset.subIndex);
    const action = button.dataset.subAction;

    if (action === "remove") {
      state.editor.subRecipes.splice(index, 1);
    }

    if (action === "up" && index > 0) {
      [state.editor.subRecipes[index - 1], state.editor.subRecipes[index]] = [
        state.editor.subRecipes[index],
        state.editor.subRecipes[index - 1],
      ];
    }

    if (action === "down" && index < state.editor.subRecipes.length - 1) {
      [state.editor.subRecipes[index + 1], state.editor.subRecipes[index]] = [
        state.editor.subRecipes[index],
        state.editor.subRecipes[index + 1],
      ];
    }

    syncEditorToMarkdown();
    markDirty();
    renderAll();
  });

  $("optionalSections").addEventListener("input", (event) => {
    const index = Number(event.target.dataset.optionalIndex);
    const field = event.target.dataset.optionalField;

    if (!Number.isInteger(index) || !field) return;

    state.editor.optionalSections[index][field] = event.target.value;
    syncEditorToMarkdown();
    markDirty();
  });

  $("optionalSections").addEventListener("click", (event) => {
    const button = event.target.closest("[data-optional-action]");
    if (!button) return;

    const index = Number(button.dataset.optionalIndex);
    const action = button.dataset.optionalAction;

    if (action === "remove") {
      state.editor.optionalSections.splice(index, 1);
    }

    if (action === "up" && index > 0) {
      [state.editor.optionalSections[index - 1], state.editor.optionalSections[index]] = [
        state.editor.optionalSections[index],
        state.editor.optionalSections[index - 1],
      ];
    }

    if (action === "down" && index < state.editor.optionalSections.length - 1) {
      [state.editor.optionalSections[index + 1], state.editor.optionalSections[index]] = [
        state.editor.optionalSections[index],
        state.editor.optionalSections[index + 1],
      ];
    }

    syncEditorToMarkdown();
    markDirty();
    renderAll();
  });

  $("recipeList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-recipe-path]");
    if (!button) return;

    await loadExistingRecipe(button.dataset.recipePath);
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => handleTabChange(button.dataset.tab));
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.editor.dirty) return;

    event.preventDefault();
    event.returnValue = "";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  loadSettings();
  attachEventHandlers();
  startNewRecipe();

  try {
    await loadMetadata();
  } catch (error) {
    console.error("Metadata load failed", error);
    setConnectionStatus("Metadata failed to load.", "danger");
  }

  renderAll();
});
