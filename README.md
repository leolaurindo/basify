# Basify

Convert a selected **list** or **table** into an [Obsidian base](https://obsidian.md/help/bases).

Each list item (or table row) becomes its own note, and the plugin generates a `.base` file that shows them as a table.

## Usage

1. **Select** a list or a table in the editor.
2. Run the command **Convert selection to base** from the command palette.
3. Choose the **output folder** (and, for tables, the **filename column**).
4. Basify creates one note per item plus a `.base` file in that folder and opens it.

### Lists

Every entry becomes a note whose filename is the item text.

```
- Alan Turing
- Grace Hopper
```

Becomes two notes: `Alan Turing.md` and `Grace Hopper.md`, plus a `Alan Turing.base` file.

### Tables

The chosen column becomes the note filenames; every other column becomes a frontmatter property.

```
| Name          | Author        | Year |
| ------------- | ------------- | ---- |
| Dune          | Frank Herbert | 1965 |
| Neuromancer   | William Gibson| 1984 |
```

Becomes `Dune.md`, `Neuromancer.md`, ... each with `author` and `year` properties, plus a base file that reproduces the table.

## Back up your vault

Basify creates new files but never modifies or deletes existing ones. Still, **make sure you have a backup of your vault** before using it, as with any vault automation.

## Install

- Copy `main.js`, `manifest.json` to `<Vault>/.obsidian/plugins/basify/`.
- Enable the plugin in **Settings → Community plugins**.

Requires Obsidian **1.10.0+** (Bases).

## Develop

```bash
npm install
npm run dev     # watch mode
npm run build   # production build (tsc + esbuild)
npm run lint    # eslint
```
