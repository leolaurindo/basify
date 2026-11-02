# Basify

[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=7C3AED&label=downloads&query=%24%5B%22basify%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://community.obsidian.md/plugins/basify)

Read this in [中文](README.zh.md).

Convert a selected **list**, **task list**, or **table** into an [Obsidian base](https://obsidian.md/help/bases).

Each list item, checkbox, or table row becomes its own note with frontmatter yaml and optional Markdown body content. Basify can create a base that shows those notes as a table, or only create the base-ready notes.

Enjoying Basify? Leave a ⭐ on [GitHub](https://github.com/leolaurindo/basify) and consider helping me fund my Mandarin studies!

喜欢 Basify？欢迎在 [GitHub](https://github.com/leolaurindo/basify) 上点个 ⭐，也欢迎支持我学习普通话！

<a href="https://ko-fi.com/leolaurindo"><img src="assets/kofi-support.png" alt="Support me on Ko-fi / 在 Ko-fi 支持我" width="200"></a>

[Support on Afdian / 在爱发电支持我](#afdian)


## Usage

1. **Select** a list, task list or a table in the editor (or place the cursor inside one).
2. Run the command **Convert selection to base**.
3. Adjust anything you want in the dialog, then **Convert**.
4. Basify extracts frontmatter yaml fields and creates or updates one note per item, then optionally creates the base as a file or inline code block.

Your choices are remembered and prefilled the next time.
Even though the parser and dialog helps normalizing file names, field names and dates, 
I advise you to use a [Linter](https://github.com/platers/obsidian-linter) along with Basify.

## Examples

### Lists

Every item becomes a note named after it. Nested lists and indented paragraphs are copied into its body by default. First-level child lists move to the body’s left edge, while deeper nesting is preserved (including space- and tab-indented lists). Only parent-level entries become notes; child tags, tasks, and fields remain body text.

With the cursor inside a list, Basify detects the surrounding list block. Selecting only a parent entry still includes its full nested content, without including the next sibling entry. Selecting part of an entry expands to include its remaining descendants. This also defines the entry’s source-cleanup range, so copied children are not left orphaned.

```markdown
- Research archives #research
  Check the municipal collection first.
  - Ask about digitized records.
```

Creates `Research archives.md` with a `research` tag and the paragraph and child list in its body. Turn off **Include nested content** to opt out; removing source entries then also removes their uncopied children.

```
- Alan Turing
- Grace Hopper
```

Becomes `Alan Turing.md` and `Grace Hopper.md`. The `.base` file is named after the output folder (for example `People.base` for the `People` folder).

### Task lists

Checkbox lists become notes with a boolean property for the checkbox state (`[x]` → `true`, `[ ]` → `false`).

```
- [x] Buy eggs type: groceries
- [ ] Pay bills due:2026-08-04
```

Becomes `Buy eggs.md` (with `status: true` and `type: groceries`) and `Pay bills.md` (with `status: false` and `due: 2026-08-04`), and the base shows a checkable **status** column.

The metadata extract is removed from the note filename.

### Tables

In **Column destinations**, choose one column for the note filenames and route each other column to **Property** (the default) or **Note body**. A single body column becomes plain body content; multiple body columns become sections headed by their column names, in source-column order. Empty body cells are omitted. Body-only columns do not become properties or base columns.

By default, every non-filename column becomes a frontmatter property, as in this example:

| Name        | Author        | Year |
| ----------- | ------------- | ---- |
| Rebellion in the Backlands | Euclides da Cunha | 1902 |
| What is the Third State? | Seiyès | 1788 |
| The Black Jacobins | C. L. R. James | 1938 |
| John Coltrane: His Life and Music | Lewis Porter| 1998 |

These become, depending on the normalization you choose
```
Rebellion in the Backlands.md
what-is-the-third-state.md  # converting spaces into dashes and toggle lowercase
The_Black_Jacobins.md # converting spaces to underscores
John-Coltrane-His-Life-and-Music.md # converting spaces into dashes
```

... each with `author` and `year` properties, and a base that reproduces the table.

Even though obsidian's markdown don't recognize tables without a header row as tables they are supported too — columns are named `Column 1`, `Column 2`, ... and you can rename them with the **field names** option in the dialog.

## Configs

Everything you can configure in the dialog:

### Folders

- **Output folder** — where the notes are created.
- **Base files folder** — where the `.base` file is created.

### Note names

- **Spaces in names** — separator used in the note file names: keep spaces, or replace with dashes or underscores. This adapts to your filesystem preferences; bases work with any of them.
- **File name field** — optional property that also stores the note name (for example `title`), with its own **spaces in name field** separator and **lowercase name field** option, independent of the filename.
- **Lowercase file names** - use lowercase letters in the note file names (the file name field, if set, keeps its original case)


### Lists (incl. task lists)

- **Extract tags** — `#tag` (and nested `#tag/sub`) become a `tags` list property.
- **Extract dates** — labeled dates like `due:2025-01-01`, `start:2026-08-01`, or `@2023-04-05` become fields named after the label (`due`, `start`, `date`, ...). An unlisted label (e.g. `meeting:2026-01-01`) falls back to a `date` field — only the first one; extra ones stay in the name.
- **Dynamic field extraction** — every `key:value` pair becomes a field (so `type: task` → a `type` field); quote multi-word values containing `key:` text, such as `title: "Research: a guide"`. It supersedes the tag and date options: when it's on, tags and dates are extracted too.

- **Lowercase property names** — use lowercase letters in the frontmatter property names (for example `Publication Year` → `publication_year`).

#### Dynamic field values

Use brackets for an explicit list: `authors: [Ada, Bob]`. Commas inside quoted items are preserved, as in `authors: [Ada, "Smith, John"]`. Without brackets, comma-containing values stay text; quote the whole value when needed, for example `author: "Smith, John"`. Numbers, booleans, and `YYYY-MM-DD` dates in lists use their native frontmatter forms.

### Task lists

- **Status field** — property name for the checkbox state (default `status`).

### Tables

- **Column destinations** — choose **Filename**, **Property**, or **Note body** for each column. To change the filename column, select **Filename** on the new column first; the previous filename column becomes a property.
- **Field names** — for headerless tables, name each column's property (default `Column 1`, `Column 2`, ...).

### Bases

- **Create base as** — create a `.base` file, **Embed in this note**, or **Don't create a base** to create only base-ready notes.
- **Embed base file in this note** — under `.base` file mode, also insert a link to the base file in the current note.

### Source entries

- **Keep all entries** — preserve the original list or table and append an inline base or embedded base link below it.
- **Remove converted entries** — remove created or merged entries while retaining conflicts that were skipped. This is the default.
- **Remove all entries** — remove every selected entry, including skipped conflicts.

### Existing notes

- **Skip** — leave an existing note unchanged.
- **Create with suffix** — add your suffix to the filename. Further conflicts are numbered (`File copy.md`, `File copy 2.md`, ...).
- **Merge, prefer new properties** — replace conflicting frontmatter properties with converted values.
- **Merge, prefer existing properties** — preserve existing frontmatter values and add only properties that are missing.

When merging, **Existing note body** independently controls incoming body content:

- **Append at bottom (recommended)** — default; preserve existing text and add incoming content below it. Repeated conversions can append duplicate content.
- **Replace existing body** — overwrite the existing body, with an inline warning that its current content will be lost. Frontmatter still follows the selected property-merge rule.
- **Leave existing body unchanged** — do not copy incoming content. An inline warning explains that removing source entries discards that incoming content.

Append and replace use incoming content only, without the new-note layout. Empty incoming content leaves the existing body unchanged, even in replace mode. **Skip** never modifies the existing note; suffix/hash modes create separate notes using the layout. There are no additional confirmation dialogs: source cleanup follows **Source entries**, including when incoming body content was not written.

Merge choices treat each property as one value. Lists and other property values are replaced or preserved as a whole rather than combined.

## Fields convertion

Property names are normalized to work in bases: spaces and dashes become underscores (for example `Publication Year` becomes `Publication_Year`), and can optionally be lowercased (`publication_year`).

Values are converted with minimal parsing, so Obsidian keeps useful types:

- Numbers (e.g. `1867`) stay numbers.
- The words `true` and `false` become booleans; checkbox lists always produce a boolean `status`.
- Dates use Obsidian's `YYYY-MM-DD` format, lists use one item per line, and ordinary text stays unquoted. Values are quoted only when YAML syntax requires it.

For better cleaning and normalization of the generated frontmatter, install the [Linter](https://github.com/platers/obsidian-linter) community plugin and run it after converting.

## Settings

In **Settings → Community plugins → Basify** you can control which folders the dialog is prefilled with:

- **Default output folder** — the folder shown for the notes.
- **Default base files folder** — the folder shown for the `.base` file.

Each can be one of:

- **Same folder as the active note** (default) — prefilled from the note you're editing.
- **Last used** — prefilled with the folder from your previous conversion.
- **Fixed path** — prefilled with a path you type in the settings.

The dialog is always the source of truth: whatever you set there is what's used, and it becomes the "last used" value for the next time.

### Note body layout

In **Settings → Basify → Note body layout**, write Markdown with static text and these placeholders:

- `{{title}}` — readable title before filename normalization, with extracted list metadata removed.
- `{{body}}` — incoming content from table columns or nested list content.
- `{{source}}` — an Obsidian link to the source note.

The default is just `{{body}}`. For example:

```markdown
# {{title}}

{{body}}

---
Source: {{source}}
```

The layout initializes new notes, including suffixed copies, after their YAML frontmatter. It does not run scripts or support conditions, template files, or arbitrary property substitutions. Conversions with incoming body content require `{{body}}` in the layout so that content cannot be accidentally omitted. There are no previews or extra workflow steps. Conversion choices are remembered globally and per source note.

Existing users receive a one-time Basify announcement about this feature update, with an expandable 中文 translation, a brief explanation of the change to nested content handling, and optional Ko-fi and Afdian support links to help fund my Mandarin studies. Opening a support link takes you to that external website; the popup itself makes no network requests. Dismissing it is remembered; it does not reappear on subsequent launches or patch releases. Fresh installs do not show the update announcement. Nested-content preservation is enabled by default for existing users as well as fresh installs.

## Back up your vault

Basify can create notes, merge generated properties, append or replace existing note bodies, and remove converted source entries. It does not delete existing note files. **Make sure you have a backup of your vault** before using it, as with any vault automation.

## Install
- The best place to install is from obsidian community plugins.

Alternatively:
- Copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/basify/`.
- Enable the plugin in **Settings → Community plugins**.

Requires Obsidian **1.13.0+**.

## Develop

```bash
npm install
npm run dev     # watch mode
npm run build   # production build (tsc + esbuild)
npm run test    # unit tests (no extra dependencies)
npm run lint    # eslint
```

## Release

Release tags must exactly match the version in `manifest.json`, without a leading `v`. From a clean working tree on `master`:

```bash
npm version 0.1.2 -m "Release %s"
git push origin master 0.1.2
```

Pushing the tag runs the release workflow. It verifies the package and manifest versions, runs the tests, lint, and build, then creates the GitHub release with `main.js`, `manifest.json`, and `styles.css` attached.

<a id="afdian"></a>

## Support on Afdian / 在爱发电支持我

<a href="https://afdian.com/a/leolaurindo"><img src="assets/afdian-support.jpg" alt="Support me on Afdian / 在爱发电支持我" width="300"></a>
