const fields = [
  "title",
  "category",
  "recipeClass",
  "person",
  "servings",
  "prepTime",
  "cookTime",
  "mainIngredients",
  "mainSteps",
  "assembly",
  "notes",
];

const TAXONOMY_PATH = "./pilot-data/recipe-taxonomy.json";
const recipeMetadata = {
  categoriesBySlug: new Map(),
  recipesByPath: new Map(),
};

const $ = (id) => document.getElementById(id);

function clean(value) {
  return value.trim();
}

function yamlValue(value) {
  if (!value) return '""';

  return `"${value.replace(/"/g, '\\"')}"`;
}

function flattenCategories(categories) {
  return Object.entries(categories).flatMap(([groupName, groupCategories]) => {
    return Object.entries(groupCategories).map(([categoryName, category]) => ({
      value: category.slug || categoryName,
      label: groupName ? `${groupName} / ${categoryName}` : categoryName,
      classes: (category.classes || []).map((recipeClass) => ({
        value: recipeClass.slug || String(recipeClass.classNumber || ""),
        label: recipeClass.classNumber
          ? `${recipeClass.classNumber} - ${recipeClass.name}`
          : recipeClass.name,
        recipes: (recipeClass.recipes || []).map((recipe) => ({
          value: recipe.recipePath,
          label: `${recipe.recipeName} (${recipe.personName}) - ${recipeClass.name}`,
          path: recipe.recipePath,
          recipeName: recipe.recipeName,
          recipeSlug: recipe.recipeSlug,
          personId: recipe.personId,
          classSlug: recipeClass.slug || String(recipeClass.classNumber || ""),
          categorySlug: category.slug || categoryName,
        })),
      })),
    }));
  });
}

function populateSelect(selectId, options, placeholder) {
  const select = $(selectId);

  if (!select) return;

  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = placeholder;
  select.appendChild(defaultOption);

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.appendChild(element);
  });
}

function updateClassOptions() {
  const categorySlug = clean($("category").value);
  const category = recipeMetadata.categoriesBySlug.get(categorySlug);
  const classOptions = category?.classes || [];
  const currentValue = clean($("recipeClass").value);

  populateSelect(
    "recipeClass",
    classOptions,
    categorySlug ? "Select a class" : "Select a category first",
  );

  if (classOptions.some((option) => option.value === currentValue)) {
    $("recipeClass").value = currentValue;
  }
}

function updateExistingRecipeOptions(recipeOptions = []) {
  const currentValue = clean($("existingRecipe").value);

  populateSelect(
    "existingRecipe",
    recipeOptions,
    recipeOptions.length ? "Select an existing recipe" : "No existing recipes",
  );

  if (recipeOptions.some((option) => option.value === currentValue)) {
    $("existingRecipe").value = currentValue;
  }
}

function setEditingBanner(recipeName = "") {
  const banner = $("editingBanner");
  const name = $("editingRecipeName");

  if (!banner || !name) return;

  if (recipeName) {
    name.textContent = recipeName;
    banner.hidden = false;
    return;
  }

  name.textContent = "";
  banner.hidden = true;
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!match) {
    return { data: {}, body: markdown };
  }

  const data = {};

  match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) return;

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');
      data[key] = value;
    });

  return {
    data,
    body: markdown.slice(match[0].length),
  };
}

function extractSection(markdown, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `### ${escapedHeading}\\n\\n([\\s\\S]*?)(?=\\n### |\\n---\\n|$)`,
  );

  return markdown.match(regex)?.[1].trim() || "";
}

function parseSubRecipes(markdown) {
  const blocks = markdown.match(/---\n\n## [\s\S]*?(?=\n---\n## Assembly|$)/g) || [];

  return blocks.map((block) => ({
    name: block.match(/## (.+)/)?.[1]?.trim() || "",
    ingredients: extractSection(block, "Ingredients"),
    steps: extractSection(block, "Steps"),
  }));
}

function setSubRecipes(subRecipes) {
  $("subRecipes").innerHTML = "";

  if (!subRecipes.length) {
    addSubRecipe();
    return;
  }

  subRecipes.forEach((subRecipe) => {
    addSubRecipe(subRecipe);
  });
}

function populateFormFromMarkdown(markdown) {
  const { data, body } = parseFrontmatter(markdown);

  $("title").value = data.title || "";
  $("servings").value = data.servings || "";
  $("prepTime").value = data.prepTime || "";
  $("cookTime").value = data.cookTime || "";

  const mainRecipeMatch = body.match(
    /## Main Recipe[\s\S]*?### Ingredients\n\n([\s\S]*?)\n\n### Steps\n\n([\s\S]*?)(?=\n---\n\n## |\n---\n## |\n---\n\n## Assembly|\n## Assembly|$)/,
  );

  $("mainIngredients").value = mainRecipeMatch?.[1]?.trim() || "";
  $("mainSteps").value = mainRecipeMatch?.[2]?.trim() || "";
  $("assembly").value = body.match(
    /## Assembly\n\n([\s\S]*?)(?=\n---\n\n## Notes|\n## Notes|$)/,
  )?.[1]?.trim() || "";
  $("notes").value = body.match(/## Notes\n\n([\s\S]*?)$/)?.[1]?.trim() || "";

  setSubRecipes(parseSubRecipes(body));
}

function resetRecipeForm() {
  $("title").value = "";
  $("servings").value = "";
  $("prepTime").value = "";
  $("cookTime").value = "";
  $("mainIngredients").value = "";
  $("mainSteps").value = "";
  $("assembly").value = "";
  $("notes").value = "";
  $("category").value = "";
  updateClassOptions();
  $("recipeClass").value = "";
  $("person").value = "";
  setSubRecipes([]);
}

function applyRecipeMetadataSelection(recipe) {
  if (!recipe) return;

  $("category").value = recipe.categorySlug || "";
  updateClassOptions();
  $("recipeClass").value = recipe.classSlug || "";
  $("existingRecipe").value = recipe.path;
  $("person").value = recipe.personId || "";
}

async function fetchRecipeFromGithub(recipePath) {
  const owner = clean($("githubOwner").value);
  const repo = clean($("githubRepo").value);
  const branch = clean($("githubBranch").value) || "main";
  const token = clean($("githubToken").value);

  if (!owner || !repo) {
    throw new Error("GitHub owner and repo are required.");
  }

  const apiUrl = new URL(
    `https://api.github.com/repos/${owner}/${repo}/contents/${recipePath}`,
  );
  apiUrl.searchParams.set("ref", branch);

  const headers = {
    Accept: "application/vnd.github+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl.toString(), { headers });

  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload.content?.replace(/\n/g, "");

  if (!content) {
    throw new Error("GitHub response did not include file content.");
  }

  return atob(content);
}

async function loadExistingRecipe(recipePath) {
  if (!recipePath) {
    setEditingBanner("");
    resetRecipeForm();
    updatePreview();
    return;
  }

  const recipe = recipeMetadata.recipesByPath.get(recipePath);

  if (!recipe) {
    console.error("Unknown recipe selection", recipePath);
    return;
  }

  try {
    $("existingRecipe").disabled = true;
    setEditingBanner(`Loading ${recipe.recipeName}...`);
    applyRecipeMetadataSelection(recipe);
    const markdown = await fetchRecipeFromGithub(recipePath);
    populateFormFromMarkdown(markdown);
    setEditingBanner(recipe.recipeName);
  } catch (error) {
    console.error("Unable to load existing recipe", error);
    setEditingBanner("Unable to load recipe from GitHub");
  } finally {
    $("existingRecipe").disabled = false;
    updatePreview();
  }
}

async function loadRecipeMetadata() {
  try {
    const response = await fetch(TAXONOMY_PATH);

    if (!response.ok) {
      throw new Error(`Failed to load metadata: ${response.status}`);
    }

    const metadata = await response.json();
    const people = (metadata.people || []).map((person) => ({
      value: person.id,
      label: person.name,
    }));
    const categories = flattenCategories(metadata.categories || {});
    const recipes = categories.flatMap((category) =>
      category.classes.flatMap((recipeClass) => recipeClass.recipes || []),
    );
    recipeMetadata.categoriesBySlug = new Map(
      categories.map((category) => [category.value, category]),
    );
    recipeMetadata.recipesByPath = new Map(
      recipes.map((recipe) => [recipe.path, recipe]),
    );

    populateSelect("person", people, "Select a person");
    populateSelect("category", categories, "Select a category");
    updateClassOptions();
    updateExistingRecipeOptions(recipes);
  } catch (error) {
    console.error("Unable to load recipe metadata", error);
    populateSelect("person", [], "Unable to load people");
    populateSelect("category", [], "Unable to load categories");
    populateSelect("recipeClass", [], "Unable to load classes");
    populateSelect("existingRecipe", [], "Unable to load recipes");
  }

  updatePreview();
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
    .map((line, index) => {
      const text = line.replace(/^\d+\.\s*/, "");
      return `${index + 1}. ${text}`;
    })
    .join("\n");
}

function addSubRecipe(data = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "sub-recipe";
  wrapper.dataset.subRecipe = "true";

  wrapper.innerHTML = `
    <hr>

    <label>
      Sub Recipe Name
      <input class="sub-name" placeholder="Black Olive Tapenade" value="${data.name || ""}">
    </label>

    <label>
      Sub Recipe Ingredients
      <textarea class="sub-ingredients" placeholder="- 1 cup black olives&#10;- 1 tbsp capers">${data.ingredients || ""}</textarea>
    </label>

    <label>
      Sub Recipe Steps
      <textarea class="sub-steps" placeholder="1. Pulse everything together.">${data.steps || ""}</textarea>
    </label>

    <button type="button" class="remove-sub-recipe">Remove Sub Recipe</button>
  `;

  wrapper.querySelectorAll("input, textarea").forEach((element) => {
    element.addEventListener("input", updatePreview);
  });

  wrapper.querySelector(".remove-sub-recipe").addEventListener("click", () => {
    wrapper.remove();
    updatePreview();
  });

  $("subRecipes").appendChild(wrapper);
  updatePreview();
}

function buildSubRecipesMarkdown() {
  const subRecipes = [...document.querySelectorAll("[data-sub-recipe='true']")];

  return subRecipes
    .map((section, index) => {
      const name =
        section.querySelector(".sub-name").value.trim() ||
        `Sub Recipe ${index + 1}`;

      const ingredients = section.querySelector(".sub-ingredients").value;
      const steps = section.querySelector(".sub-steps").value;

      return `---

## ${name}

### Ingredients

${ensureList(ingredients)}

### Steps

${ensureSteps(steps)}
`;
    })
    .join("\n");
}

function buildMarkdown() {
  const title = clean($("title").value) || "Recipe Name";
  const category = clean($("category").value);
  const recipeClass = clean($("recipeClass").value);
  const person = clean($("person").value);

  return `---
title: ${title}
category: ${yamlValue(category)}
class: ${yamlValue(recipeClass)}
person: ${yamlValue(person)}
servings: ${clean($("servings").value)}
prepTime: ${clean($("prepTime").value)}
cookTime: ${clean($("cookTime").value)}
---

# ${title}

## Main Recipe

### Ingredients

${ensureList($("mainIngredients").value)}

### Steps

${ensureSteps($("mainSteps").value)}

${buildSubRecipesMarkdown()}

---

## Assembly

${ensureSteps($("assembly").value)}

---

## Notes

${ensureList($("notes").value)}
`;
}

function updatePreview() {
  $("output").textContent = buildMarkdown();
}

fields.forEach((id) => {
  $(id).addEventListener("input", updatePreview);
});

$("category").addEventListener("change", () => {
  updateClassOptions();
  updatePreview();
});

$("recipeClass").addEventListener("change", () => {
  updatePreview();
});

$("existingRecipe").addEventListener("change", async (event) => {
  await loadExistingRecipe(clean(event.target.value));
});

$("addSubRecipeBtn").addEventListener("click", () => {
  addSubRecipe();
});

$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildMarkdown());

  $("copyBtn").textContent = "Copied!";

  setTimeout(() => {
    $("copyBtn").textContent = "Copy Markdown";
  }, 1200);
});

function setCookie(name, value, days = 30) {
  const encodedValue = encodeURIComponent(value);
  const maxAge = days * 24 * 60 * 60;

  document.cookie = `${name}=${encodedValue}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const cookies = document.cookie.split("; ");

  const match = cookies.find((cookie) => {
    return cookie.startsWith(`${name}=`);
  });

  if (!match) return "";

  return decodeURIComponent(match.split("=")[1]);
}

function loadGithubSettings() {
  $("githubOwner").value = getCookie("recipeGithubOwner") || "kevinmmiller";
  $("githubRepo").value = getCookie("recipeGithubRepo") || "recipes";
  $("githubBranch").value = getCookie("recipeGithubBranch") || "main";
  $("githubToken").value = getCookie("recipeGithubToken");
}

function saveGithubSettings() {
  setCookie("recipeGithubOwner", $("githubOwner").value);
  setCookie("recipeGithubRepo", $("githubRepo").value);
  setCookie("recipeGithubBranch", $("githubBranch").value || "main");
  setCookie("recipeGithubToken", $("githubToken").value);

  $("saveGithubSettingsBtn").textContent = "Saved!";

  setTimeout(() => {
    $("saveGithubSettingsBtn").textContent = "Save GitHub Settings";
  }, 1200);
}

function initGithubSettings() {
  const toggleButton = $("toggleGithubBtn");
  const settingsPanel = $("githubSettings");
  const saveButton = $("saveGithubSettingsBtn");

  if (!toggleButton || !settingsPanel || !saveButton) {
    console.error("Missing GitHub settings elements", {
      toggleButton,
      settingsPanel,
      saveButton,
    });
    return;
  }

  toggleButton.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });

  saveButton.addEventListener("click", () => {
    saveGithubSettings();
  });

  loadGithubSettings();
}

document.addEventListener("DOMContentLoaded", () => {
  initGithubSettings();
  addSubRecipe();
  loadRecipeMetadata();
});
