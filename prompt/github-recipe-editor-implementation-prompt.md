# GitHub Recipe Editor Page: Implementation Prompt

## Role

You are a senior software architect, application developer, interaction designer, and visual systems engineer.

Your responsibility is to design and implement a focused web page for managing Markdown recipe files stored in GitHub.

This is not the recipe formatter, website generator, print renderer, or deployment system.

The page has one primary purpose:

> Allow a user to retrieve Markdown recipes from GitHub, create or edit them through a usable interface, and safely save the updated Markdown back to GitHub.

Inspect the existing repository, application, recipe files, Visual Engineering research, and supporting components before making changes.

Challenge the current implementation where necessary, but keep the solution narrowly focused on the recipe editing workflow.

---

# Primary User Workflow

The completed page must support this workflow:

1. The user opens the recipe editor.
2. The application connects to the configured GitHub repository.
3. The application retrieves the available Markdown recipe files.
4. The user selects an existing recipe or chooses to create a new one.
5. The page loads the Markdown and YAML front matter.
6. The user edits the recipe through structured form controls.
7. The user can inspect and edit the raw Markdown when needed.
8. The page validates the recipe.
9. The user reviews the proposed changes.
10. The application pushes the Markdown file back to GitHub.
11. The application clearly reports whether the save succeeded, failed, or encountered a conflict.

Do not add unrelated content-management features unless they directly support this workflow.

---

# Scope

The page must support:

- Connecting to a configured GitHub repository
- Listing recipe Markdown files
- Searching and filtering recipes
- Loading an existing recipe
- Parsing YAML front matter
- Parsing recipe Markdown
- Editing recipe metadata
- Editing ingredients
- Editing instructions
- Editing notes and optional sections
- Viewing or editing the raw Markdown
- Previewing the resulting recipe
- Creating new Markdown recipe files
- Validating recipes before saving
- Comparing local changes with the GitHub version
- Creating or updating files in GitHub
- Detecting remote changes
- Showing clear success and error states

The page does not need to:

- Generate the public recipe website
- Publish HTML
- Render the final competition print page
- Deploy the repository
- Manage unrelated repository files
- Replace GitHub as the source of truth
- Become a general-purpose Markdown editor

---

# Repository Discovery

Before implementation, inspect the repository and determine:

- Where recipe files are stored
- How recipe filenames are structured
- Which YAML front matter fields currently exist
- Which fields are required
- How ingredients are represented
- How instructions are represented
- Which optional sections recipes use
- Whether recipes use multiple ingredient components
- Whether recipes include entrant, entry, category, or class metadata
- Whether a recipe schema already exists
- Whether shared GitHub utilities already exist
- Whether reusable web components already exist
- Whether design tokens or styling systems already exist
- Where the Visual Engineering findings are stored
- Which framework or application architecture the editor uses
- How secrets and environment configuration are handled

Preserve compatibility with existing valid recipe files whenever practical.

Do not invent a completely different format unless the current format is demonstrably inadequate.

---

# GitHub Configuration

The application should support configuration similar to:

```text
GITHUB_OWNER
GITHUB_REPOSITORY
GITHUB_RECIPE_PATH
GITHUB_DEFAULT_BRANCH
GITHUB_API_URL
```

Authentication must be handled securely.

The browser must not receive a permanent repository token through:

- Bundled JavaScript
- Public environment variables
- HTML
- Local source files
- Generated configuration files
- Query-string parameters

Use one of these approaches:

1. A secure server-side API that performs GitHub operations.
2. A GitHub App installation.
3. An OAuth flow that gives the user authorized repository access.
4. A development-only token entered for the current session and kept only in memory.

Do not store a GitHub token in `localStorage`.

Do not print tokens in console output, logs, errors, or network responses.

---

# GitHub Data Retrieval

The page must be able to retrieve:

- Repository information
- The configured branch
- The recipe directory contents
- Markdown recipe filenames
- File paths
- File SHAs
- File contents
- Last commit information when useful

The recipe list should display useful information such as:

- Recipe title
- Filename
- Entrant
- Entry number
- Category
- Class
- Validation status
- Last modification information when available

Do not require loading the complete contents of every recipe before displaying the initial list unless the repository is small enough that this is clearly reasonable.

Use caching carefully, but GitHub remains the authoritative source.

---

# Existing Recipe Selection

The user must be able to:

- Browse recipes
- Search by title
- Search by filename
- Filter by entrant
- Filter by category
- Filter by class
- Filter by validation status
- Sort recipes predictably
- Select a recipe for editing
- See whether the selected file has unsaved changes

When the user changes recipes while edits are unsaved, the page must warn them before discarding those changes.

---

# Recipe Data Model

Determine the actual recipe model from the repository.

A likely recipe may contain metadata similar to:

```yaml
---
id:
title:
entrant:
entry_number:
category:
class_number:
class_name:
description:
yield:
prep_time:
cook_time:
total_time:
status:
tags:
---
```

Do not assume every field is required.

Classify each field as:

- Required
- Optional
- Generated
- Read-only
- Competition-specific
- Internal
- Displayed to the user
- Hidden from normal editing

The editor should preserve unknown front matter fields even when it does not provide dedicated controls for them.

It must never silently delete metadata that it does not understand.

---

# Structured Recipe Editor

Provide a structured interface for common recipe sections.

## Metadata

Support fields such as:

- Recipe title
- Entrant
- Entry number
- Category
- Class number
- Class name
- Description
- Yield
- Preparation time
- Cooking time
- Total time
- Status
- Tags

Use appropriate controls rather than presenting everything as one large text box.

Use select controls for known categories or classes when repository data provides valid options.

Allow manual entry when the repository permits values outside a fixed list.

## Ingredients

The ingredient editor must support:

- Adding an ingredient
- Removing an ingredient
- Editing ingredient text
- Reordering ingredients
- Adding ingredient groups
- Renaming ingredient groups
- Reordering ingredient groups
- Preserving free-form ingredient wording
- Supporting optional quantities, units, preparation notes, and annotations

Do not over-structure ingredient lines if the existing Markdown format treats them as readable free-form text.

The editor may expose structured fields internally, but the generated Markdown must remain clear and natural.

Example:

```markdown
## Ingredients

### Cake

- 2 cups all-purpose flour
- 1 teaspoon baking powder

### Glaze

- 1 cup confectioners' sugar
- 2 tablespoons lemon juice
```

## Instructions

The instruction editor must support:

- Adding a step
- Removing a step
- Editing a step
- Reordering steps
- Adding instruction sections when supported
- Preserving paragraph breaks inside complex steps
- Supporting Markdown emphasis where appropriate

Example:

```markdown
## Instructions

1. Heat the oven to 350°F.
2. Combine the dry ingredients.
3. Fold in the remaining ingredients.
```

The application should renumber ordered steps automatically when serializing the Markdown.

## Optional Sections

Support existing optional sections such as:

- Notes
- Presentation
- Serving instructions
- Storage
- Make-ahead instructions
- Garnish
- Source
- Judging notes
- Allergen information

Do not display every possible optional section permanently.

Allow the user to add applicable sections from an available-section menu.

---

# New Recipe Creation

The page must allow users to create a new Markdown recipe.

The new-recipe workflow should:

1. Ask for the minimum required information.
2. Generate or request a stable recipe ID.
3. Suggest a filename based on repository conventions.
4. Check whether the filename already exists.
5. Check whether the recipe ID already exists.
6. Check whether the entry number conflicts with another recipe when relevant.
7. Create an initial recipe structure.
8. Open the new recipe in the editor.
9. Mark it as unsaved until it is pushed to GitHub.

A new recipe template might resemble:

```markdown
---
id: example-recipe
title: Example Recipe
entrant: Kevin Miller
entry_number:
category:
class_number:
class_name:
status: draft
tags: []
---

# Example Recipe

## Ingredients

- 

## Instructions

1. 
```

Adapt the template to the repository's actual conventions.

Do not push an empty or invalid recipe merely because the file was created in the user interface.

---

# Raw Markdown Mode

Provide a raw Markdown editor for advanced editing and recovery.

The user must be able to switch between:

- Structured editor
- Raw Markdown
- Preview

When switching from raw Markdown to structured mode:

1. Parse the Markdown.
2. Validate the front matter.
3. Preserve recognized and unrecognized fields.
4. Report sections that cannot be mapped safely.
5. Do not silently rewrite or discard unsupported content.

When structured edits regenerate Markdown:

- Preserve the canonical repository format.
- Keep the output readable.
- Avoid unnecessary formatting changes.
- Avoid rewriting untouched sections where practical.
- Preserve unknown sections.
- Preserve comments when the parser supports doing so.

The user should be able to inspect the exact Markdown that will be sent to GitHub before saving.

---

# Preview

The preview should show how the recipe content is interpreted.

The preview is not required to reproduce the final competition print output exactly.

It should help the user verify:

- Title
- Metadata
- Ingredient groups
- Instructions
- Notes
- Markdown emphasis
- Section ordering
- Missing or malformed content

The preview should update as edits are made, either immediately or after a short debounce.

The preview must sanitize untrusted HTML.

---

# Validation

Validate recipes before allowing them to be pushed.

Validation should detect:

- Missing required front matter
- Invalid YAML
- Missing title
- Missing ingredients
- Missing instructions
- Duplicate recipe ID
- Duplicate filename
- Duplicate entry number where prohibited
- Invalid class or category
- Empty ingredient groups
- Empty instruction steps
- Unsupported file paths
- Invalid filename characters
- Unsafe embedded HTML
- Broken section structure
- Content that cannot be converted safely between raw and structured modes

Each validation result should include:

- Severity
- Field or section
- Description
- Suggested correction

Use severity levels such as:

```text
error
warning
information
```

Errors should prevent saving.

Warnings should require acknowledgment when they could represent a real content problem.

Informational findings should not block saving.

---

# Change Tracking

The page must clearly distinguish:

- The version currently stored in GitHub
- The version loaded into the editor
- The current edited version
- The exact changes that will be pushed

Track unsaved changes.

Provide a review step before writing to GitHub.

The review should show:

- Filename
- Repository path
- Branch
- Whether the file is new or updated
- Metadata changes
- Content changes
- Raw Markdown diff
- Validation status
- Commit message

The user should not need to rely on memory to understand what is about to change.

---

# GitHub Save Workflow

For an existing recipe:

1. Store the GitHub file SHA when the recipe is loaded.
2. Allow the user to edit locally.
3. Validate the edited recipe.
4. Fetch the current remote file state before saving.
5. Compare the current remote SHA with the loaded SHA.
6. If they match, send the updated file.
7. If they differ, stop and report a conflict.
8. Refresh the local file SHA after a successful update.

For a new recipe:

1. Validate the filename.
2. Confirm that the file does not already exist.
3. Validate the complete recipe.
4. Create the new Markdown file.
5. Record the returned SHA.
6. Convert the local state from new to saved.

Use GitHub's file SHA or equivalent commit identity for optimistic concurrency.

Never overwrite a remotely modified file without showing the conflict.

---

# Save Strategy

Support one or both of the following repository strategies, depending on the project configuration.

## Direct Branch Update

The page updates the configured branch directly.

Use this only when:

- The repository intentionally permits it
- The user has appropriate permission
- Validation succeeds
- No version conflict exists

## Pull Request Workflow

The page:

1. Creates a working branch.
2. Writes the Markdown file to that branch.
3. Creates a commit.
4. Opens a pull request.
5. Returns the pull request link.

This should be the safer default when multiple people or agents may edit the recipes.

Make the repository's save strategy configurable.

Do not silently switch between direct updates and pull requests.

---

# Commit Messages

Generate a useful default commit message.

Examples:

```text
recipe: add maple cream pie
recipe: update pit beef instructions
recipe: correct class metadata for blueberry compote
```

Allow the user to edit the commit message before saving.

Do not use vague messages such as:

```text
update file
changes
recipe edits
```

---

# Conflict Handling

A conflict occurs when the GitHub version changes after the user loads the recipe.

When a conflict is detected:

- Do not overwrite the remote file.
- Show that another change occurred.
- Retrieve the latest remote Markdown.
- Show the loaded version, edited version, and latest remote version.
- Attempt a three-way comparison.
- Highlight conflicting sections.
- Allow the user to copy their work.
- Allow the user to reload the remote version.
- Allow a manual merge.
- Revalidate the merged result before saving.

Never imply that the user's work was saved when it was not.

---

# Error Handling

Provide clear handling for:

- Missing authentication
- Expired authentication
- Insufficient GitHub permissions
- Repository not found
- Branch not found
- Recipe directory not found
- GitHub rate limits
- Network failures
- Invalid Markdown
- Invalid YAML
- File conflicts
- Duplicate files
- Failed commits
- Failed pull request creation
- Failed validation
- Unsupported content

Error messages should explain:

- What happened
- Whether the user's edits remain safe locally
- What action the user can take
- Whether retrying is appropriate

Do not expose raw tokens, request headers, or sensitive server details.

---

# Local Draft Protection

Unsaved work should survive ordinary navigation or temporary failures.

Use an appropriate local draft mechanism.

A draft may include:

- Repository
- Branch
- File path
- Loaded SHA
- Edited content
- Last local edit time

Do not store GitHub credentials with the draft.

When reopening a recipe with a saved local draft, offer to:

- Restore the draft
- Compare it with GitHub
- Discard it

Clearly label restored drafts as not yet saved to GitHub.

---

# Visual Engineering Review

Inspect the available Visual Engineering research and apply the findings that are relevant to this editing page.

Focus on:

- Information hierarchy
- Form composition
- Reading order
- Editor density
- Progressive disclosure
- Spacing
- Typography
- Alignment
- Error placement
- Warning treatment
- Empty states
- Loading states
- Save-state communication
- Navigation
- Comparison and diff presentation
- Accessibility
- Perceived safety
- Visual polish

Do not apply every Visual Engineering finding indiscriminately.

Determine which findings improve this specific workflow.

Create a concise decision record explaining:

- Which visual principles were used
- Where they were applied
- Which findings were not applicable
- Which design assumptions remain uncertain

The editor should feel intentional and polished, not like an administrative form assembled from default controls.

---

# Recommended Page Structure

A likely desktop composition is:

```text
┌──────────────────────────────────────────────────────────────┐
│ Repository / Branch                         Connection State │
├───────────────────┬──────────────────────────────────────────┤
│ Recipe List       │ Recipe Editor                            │
│                   │                                          │
│ Search            │ Title and Save Status                    │
│ Filters           │                                          │
│                   │ Structured | Markdown | Preview          │
│ Recipe items      │                                          │
│                   │ Main editing area                        │
│ New Recipe        │                                          │
│                   │ Validation and review                    │
├───────────────────┴──────────────────────────────────────────┤
│ Save, Review Changes, or Create Pull Request                 │
└──────────────────────────────────────────────────────────────┘
```

This is a starting hypothesis, not a mandatory design.

Evaluate whether another composition better supports the workflow.

On smaller screens, use a staged workflow rather than forcing the entire desktop editor into a narrow viewport.

---

# Editor States

The page must visibly communicate states such as:

```text
Not connected
Connecting
Loading recipes
Recipe loaded
New unsaved recipe
Edited
Validating
Validation failed
Ready to save
Saving
Saved
Save failed
Remote conflict
Authentication expired
GitHub unavailable
```

Do not communicate save state using color alone.

The user should always be able to tell whether the current recipe exists only locally or has been saved to GitHub.

---

# Accessibility

The editor must support:

- Semantic labels
- Keyboard navigation
- Visible focus states
- Logical tab order
- Accessible validation summaries
- Error messages associated with fields
- Screen-reader status announcements
- Sufficient contrast
- Buttons with specific action names
- Accessible drag-and-drop alternatives for reordering
- Reduced-motion preferences
- Zoom and text resizing
- Mobile touch targets

Reordering ingredients or steps must not require drag-and-drop.

Provide move-up and move-down controls or another keyboard-accessible method.

---

# Component Architecture

Use or create focused components such as:

```text
GitHubConnectionStatus
RepositoryRecipeList
RecipeSearch
RecipeFilters
RecipeEditor
RecipeMetadataForm
IngredientGroupEditor
IngredientEditor
InstructionEditor
OptionalSectionEditor
RawMarkdownEditor
RecipePreview
ValidationSummary
ChangeReview
MarkdownDiff
ConflictResolver
SaveRecipeDialog
NewRecipeDialog
UnsavedChangesWarning
```

Do not place all state, GitHub requests, parsing, and rendering inside one page component.

Separate:

```text
GitHub client
Authentication
Recipe repository service
Markdown parser
Markdown serializer
Recipe validation
Editor state
Draft persistence
Diff generation
Conflict detection
Visual components
```

---

# GitHub API Boundary

All GitHub operations should go through a narrow service interface.

Example operations:

```text
listRecipes()
getRecipe(path)
createRecipe(path, content, message)
updateRecipe(path, content, sha, message)
getLatestFileState(path)
createBranch(name, sourceBranch)
createPullRequest(branch, title, body)
```

The user-interface components should not construct raw GitHub API requests directly.

This separation should make it possible to replace:

- GitHub REST API
- GitHub GraphQL API
- GitHub App backend
- Local test repository
- Mock service

without rewriting the editor.

---

# Testing

Test the following workflows:

- Connect to GitHub
- List recipes
- Load a recipe
- Parse front matter
- Edit metadata
- Add and remove ingredients
- Reorder ingredients
- Add and remove instruction steps
- Switch between structured and raw Markdown
- Preserve unknown metadata
- Preserve unknown sections
- Preview Markdown
- Validate a recipe
- Create a new recipe
- Detect duplicate filename
- Save an existing recipe
- Save a new recipe
- Recover from a network failure
- Recover an unsaved local draft
- Detect remote SHA conflict
- Handle invalid GitHub credentials
- Handle insufficient permission
- Create a pull request
- Prevent saving invalid content
- Warn before abandoning unsaved changes

Use mocked GitHub responses for automated testing.

When practical, include an integration test against a dedicated test repository or recorded API fixtures.

Do not run destructive tests against the production recipe repository.

---

# Security Requirements

Review the page for:

- Token exposure
- Cross-site scripting
- Unsafe Markdown rendering
- Malicious YAML
- Path traversal
- Invalid repository paths
- Dangerous filenames
- Logging of sensitive information
- Browser storage of credentials
- Cross-site request forgery
- Unauthorized repository writes
- Accidental writes to the wrong branch
- Overwriting remote changes
- Excessively broad GitHub permissions

Treat recipe content retrieved from GitHub as untrusted input.

Sanitize the preview output.

Validate file paths on the server, even when the browser has already validated them.

---

# Documentation

Create concise documentation covering:

- Purpose of the editor
- Supported recipe format
- GitHub setup
- Authentication approach
- Required GitHub permissions
- Repository configuration
- How to edit a recipe
- How to create a recipe
- How saving works
- Direct-update versus pull-request mode
- Conflict handling
- Draft recovery
- Validation rules
- Local development
- Testing
- Security assumptions
- Known limitations

---

# Required Deliverables

Produce:

1. GitHub-connected recipe editor page
2. Recipe list and search interface
3. Existing-recipe loading
4. Structured recipe editor
5. Raw Markdown editor
6. Recipe preview
7. New-recipe workflow
8. Recipe validation
9. Unsaved-change tracking
10. Local draft recovery
11. Change review and Markdown diff
12. Safe GitHub create-file operation
13. Safe GitHub update-file operation
14. SHA conflict detection
15. Direct-update or pull-request workflow
16. Authentication and permission handling
17. Accessible user interface
18. Visual Engineering review and implementation
19. Automated tests
20. Implementation documentation

---

# Acceptance Criteria

The work is complete when:

- The page can connect to the configured GitHub repository.
- The page can list the Markdown recipe files.
- The user can select and load an existing recipe.
- YAML front matter is parsed correctly.
- Ingredients and instructions can be edited without directly editing raw Markdown.
- The raw Markdown remains available for advanced editing.
- Unknown valid metadata is preserved.
- Unknown valid recipe sections are not silently removed.
- The user can create a new recipe.
- Duplicate IDs and filenames are detected.
- The recipe is validated before saving.
- The user can inspect the exact changes before saving.
- An existing Markdown file can be updated in GitHub.
- A new Markdown file can be created in GitHub.
- Remote changes are detected through the file SHA or commit identity.
- The editor does not overwrite a changed remote file silently.
- Unsaved local work can be recovered.
- Authentication failures are understandable.
- GitHub tokens are not exposed through the browser bundle or logs.
- The page clearly communicates whether the recipe is local, edited, saving, saved, invalid, or conflicted.
- The Visual Engineering findings are reflected in the final interface.
- The primary workflow is usable with a keyboard and screen reader.
- Automated tests cover the critical create, edit, validate, conflict, and save paths.

---

# Final Report

At completion, provide:

```markdown
# GitHub Recipe Editor Implementation Report

## Summary

## Existing Repository Structure

## Recipe Format Discovered

## Page Architecture

## GitHub Authentication

## GitHub Read Workflow

## Existing Recipe Editing Workflow

## New Recipe Workflow

## Markdown Parsing and Serialization

## Validation

## Save and Pull Request Workflow

## Conflict Handling

## Draft Recovery

## Visual Engineering Findings Applied

## Accessibility

## Security Review

## Tests Performed

## Known Limitations

## Recommended Next Steps

## Commands

## Repository Root
```

Do not claim that a workflow works unless it has been implemented and tested.

Keep the implementation centered on one task:

> Retrieve Markdown recipes from GitHub, allow a person to create or edit them safely, and save the Markdown changes back to GitHub.
