# Basify

Convert a selected **list**, **task list**, or **table** into an [Obsidian base](https://obsidian.md/help/bases).

Each list item, checkbox, or table row becomes its own note with frontmatter yaml. Basify can create a base that shows those notes as a table, or only create the base-ready notes.

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

Every item becomes a note named after it.

```
- Alan Turing
- Grace Hopper
```

Becomes `Alan Turing.md` and `Grace Hopper.md`. The `.base` file is named after the output folder (for example `People.base` for the `People` folder).

### Task lists

Checkbox lists become notes with a boolean property for the checkbox state (`[x]` → `true`, `[ ]` → `false`).

```
- [x] Buy milk type: groceries
- [ ] Pay bills due:2026-08-04
```

Becomes `Buy milk.md` (with `status: true` and `type: groceries`) and `Pay bills.md` (with `status: false` and `due: 2026-08-04`), and the base shows a checkable **status** column.

The metadata extract is removed from the note filename.

### Tables

One column becomes the note filenames (you can choose); every other column becomes a frontmatter property.

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
- **Dynamic field extraction** — every `key:value` pair becomes a field (so `type: task` → a `type` field). It supersedes the tag and date options: when it's on, tags and dates are extracted too.

- **Lowercase property names** — use lowercase letters in the frontmatter property names (for example `Publication Year` → `publication_year`).

### Task lists

- **Status field** — property name for the checkbox state (default `status`).

### Tables

- **Filename column** — which column becomes the note filenames.
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
- **Merge, prefer new properties** — preserve the existing note body and replace conflicting frontmatter properties with converted values.
- **Merge, prefer existing properties** — preserve existing frontmatter values and add only properties that are missing.

Merge choices treat each property as one value. Lists and other property values are replaced or preserved as a whole rather than combined.

## Fields convertion

Property names are normalized to work in bases: spaces and dashes become underscores (for example `Publication Year` becomes `Publication_Year`), and can optionally be lowercased (`publication_year`).

Values are converted with minimal parsing, so Obsidian keeps useful types:

- Numbers (e.g. `1867`) stay numbers.
- The words `true` and `false` become booleans; checkbox lists always produce a boolean `status`.
- Everything else stays plain text.

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

## Back up your vault

Basify can create notes, merge generated properties into existing notes, and remove converted source entries. It does not delete existing note files. **Make sure you have a backup of your vault** before using it, as with any vault automation.

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
