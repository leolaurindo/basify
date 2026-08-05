import { App, TFolder, TFile, Vault, Workspace, WorkspaceLeaf } from './obsidian-stub';
import {
	getSelectionBlock,
	isTaskList,
	parseSelection,
} from '../src/selection';
import {
	BasifyOptions,
	buildBaseContent,
	buildConvertInput,
	createBaseFile,
	createNotes,
} from '../src/convert';

class FakeVault extends Vault {
	store = new Map<string, string>();

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (path === '' || path === '/') {
			return new TFolder();
		}
		if (this.store.has(path)) {
			return new TFile(path);
		}
		const prefix = path.endsWith('/') ? path : path + '/';
		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) {
				return new TFolder();
			}
		}
		return null;
	}

	async createFolder(path: string): Promise<TFolder> {
		this.store.set(path + '/', '');
		return new TFolder();
	}

	async create(path: string, data: string): Promise<TFile> {
		if (this.store.has(path)) {
			throw new Error('exists ' + path);
		}
		this.store.set(path, data);
		return new TFile(path);
	}
}

class FakeLeaf extends WorkspaceLeaf {
	async openFile(): Promise<void> {}
}

class FakeWorkspace extends Workspace {
	getLeaf(): WorkspaceLeaf {
		return new FakeLeaf();
	}
}

function makeApp(): { app: App; vault: FakeVault } {
	const app = new App();
	const vault = new FakeVault();
	app.vault = vault;
	app.workspace = new FakeWorkspace();
	return { app, vault };
}

function opts(over: Partial<BasifyOptions> = {}): BasifyOptions {
	return {
		folder: 'Books',
		baseFolder: 'Notes',
		nameColumn: 0,
		mode: 'file',
		columns: [],
		statusField: 'status',
		embedBase: false,
		extractTags: true,
		extractDates: true,
		extractDynamic: false,
		nameSeparator: 'space',
		fileNameField: '',
		fileNameFieldSeparator: 'space',
		lowercaseNames: false,
		lowercaseNameField: false,
		lowercaseYamlFields: false,
		...over,
	};
}

const tests: Array<() => Promise<void>> = [];

function test(name: string, fn: () => void | Promise<void>): void {
	tests.push(async () => {
		try {
			await fn();
			console.log('PASS', name);
		} catch (error) {
			console.error('FAIL', name, error);
			process.exitCode = 1;
		}
	});
}

async function run(): Promise<void> {
	for (const t of tests) {
		await t();
	}
	console.log('done');
}

// ---------- list parsing ----------

test('parses a bullet list', () => {
	const sel = parseSelection('- Alan Turing\n- Grace Hopper');
	if (sel === null || sel.type !== 'list') throw new Error('not a list');
	if (sel.items.map((i) => i.text).join(',') !== 'Alan Turing,Grace Hopper') {
		throw new Error('items');
	}
});

test('parses an ordered list', () => {
	const sel = parseSelection('1. Dune\n2. Neuromancer');
	if (sel === null || sel.type !== 'list') throw new Error('not a list');
	if (sel.items.map((i) => i.text).join(',') !== 'Dune,Neuromancer') {
		throw new Error('items');
	}
});

test('keeps only top-level list items', () => {
	const sel = parseSelection('- a\n  - b\n- c');
	if (sel === null || sel.type !== 'list') throw new Error('not a list');
	if (sel.items.map((i) => i.text).join(',') !== 'a,c') {
		throw new Error(JSON.stringify(sel.items));
	}
});

test('strips markdown from list item names', () => {
	const sel = parseSelection('- **Bold** [link](https://x.com) text');
	if (sel === null || sel.type !== 'list') throw new Error('not a list');
	if (sel.items[0]?.text !== 'Bold link text') throw new Error('strip failed');
});

// ---------- task lists ----------

test('detects a task list', () => {
	const sel = parseSelection('- [x] Buy milk\n- [ ] Pay bills');
	if (sel === null || !isTaskList(sel)) throw new Error('not task list');
});

test('plain list is not a task list', () => {
	const sel = parseSelection('- Buy milk\n- Pay bills');
	if (sel === null || isTaskList(sel)) throw new Error('should not be task list');
});

test('mixed list is not a task list', () => {
	const sel = parseSelection('- [x] Buy milk\n- Pay bills');
	if (sel === null || isTaskList(sel)) throw new Error('should not be task list');
});

test('task items carry checkbox state', async () => {
	const { app, vault } = makeApp();
	const sel = parseSelection('- [x] Buy milk\n- [ ] Pay bills\n- [X] Call mom');
	if (sel === null) throw new Error('no selection');
	await createNotes(app as never, buildConvertInput(sel, opts({})));
	if (!(vault.store.get('Books/Buy milk.md') ?? '').includes('status: true')) {
		throw new Error('milk not true');
	}
	if (!(vault.store.get('Books/Pay bills.md') ?? '').includes('status: false')) {
		throw new Error('bills not false');
	}
	if (!(vault.store.get('Books/Call mom.md') ?? '').includes('status: true')) {
		throw new Error('mom not true');
	}
});

test('custom status field name', () => {
	const sel = parseSelection('- [x] A\n- [ ] B');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ statusField: 'done' }));
	const props = input.notes[0]?.properties ?? {};
	if (!('done' in props)) throw new Error('expected done prop');
	if (props['done']?.value !== 'true') throw new Error('value');
});

test('empty status field falls back to status', () => {
	const sel = parseSelection('- [x] A');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ statusField: '  ' }));
	const props = input.notes[0]?.properties ?? {};
	if (!('status' in props)) throw new Error('no status prop');
});

test('plain list has no properties', () => {
	const sel = parseSelection('- A\n- B');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	if (Object.keys(input.notes[0]?.properties ?? {}).length !== 0) {
		throw new Error('plain list should have no props');
	}
});

test('extracts tags into a tags field and cleans the name', () => {
	const sel = parseSelection('- some more #some-tag');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const note = input.notes[0];
	if (note?.name !== 'some more') throw new Error('name: ' + note?.name);
	const value = note?.properties.tags?.value;
	if (!Array.isArray(value) || value.join(',') !== 'some-tag') {
		throw new Error('tags: ' + JSON.stringify(value));
	}
});

test('user scenario: task list with tags and dates', async () => {
	const { app, vault } = makeApp();
	const source = [
		'- [x] task list',
		'- [ ] some other list',
		'- [x] some more #some-tag',
		'- [ ] some more due:2025-01-01 @2023-04-05',
	].join('\n');
	const sel = parseSelection(source);
	if (sel === null) throw new Error('no selection');
	await createNotes(app as never, buildConvertInput(sel, opts({})));

	for (const name of [
		'task list',
		'some other list',
		'some more',
		'some more 2',
	]) {
		if (!vault.store.has(`Books/${name}.md`)) {
			throw new Error(`missing ${name}`);
		}
	}

	const tagNote = vault.store.get('Books/some more.md') ?? '';
	if (!tagNote.includes('tags: ["some-tag"]')) throw new Error('tags: ' + tagNote);
	if (!tagNote.includes('status: true')) throw new Error('status: ' + tagNote);

	const dateNote = vault.store.get('Books/some more 2.md') ?? '';
	if (!dateNote.includes('due: "2025-01-01"')) throw new Error('due: ' + dateNote);
	if (!dateNote.includes('date: "2023-04-05"')) throw new Error('date: ' + dateNote);
	if (!dateNote.includes('status: false')) throw new Error('status: ' + dateNote);
});

test('extracts labeled and @ dates into fields', () => {
	const sel = parseSelection('- some more due:2025-01-01 @2023-04-05');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const note = input.notes[0];
	if (note?.name !== 'some more') throw new Error('name: ' + note?.name);
	if (note?.properties.due?.value !== '2025-01-01') throw new Error('due');
	if (note?.properties.date?.value !== '2023-04-05') throw new Error('date');
});

test('unknown date label falls back to date field (first only)', () => {
	const sel = parseSelection('- x meeting:2026-01-01 other:2027-02-02');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const note = input.notes[0];
	if (note?.properties.date?.value !== '2026-01-01') {
		throw new Error('fallback: ' + JSON.stringify(note?.properties));
	}
	if ('meeting' in (note?.properties ?? {})) {
		throw new Error('meeting should not be a field');
	}
	if (note?.name !== 'x other 2027-02-02') throw new Error('name: ' + note?.name);
});

test('bare dates stay in the name', () => {
	const sel = parseSelection('- some more 2025-01-01');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const note = input.notes[0];
	if (note?.name !== 'some more 2025-01-01') throw new Error('name: ' + note?.name);
	if ('date' in (note?.properties ?? {})) throw new Error('date should not exist');
});

test('extraction can be disabled', () => {
	const sel = parseSelection('- some more #some-tag');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ extractTags: false, extractDates: false }),
	);
	const note = input.notes[0];
	if (note?.name !== 'some more some-tag') throw new Error('name: ' + note?.name);
	if ('tags' in (note?.properties ?? {})) throw new Error('tags should not exist');
});

test('dynamic field extraction turns key:value into fields', () => {
	const sel = parseSelection('- list item #tag due:2027-06-01 type: task start:2026-12-01');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ extractDynamic: true }),
	);
	const note = input.notes[0];
	if (note?.name !== 'list item') throw new Error('name: ' + note?.name);
	const props = note?.properties ?? {};
	const tags = props['tags']?.value;
	if (!Array.isArray(tags) || tags.join(',') !== 'tag') {
		throw new Error('tags: ' + JSON.stringify(tags));
	}
	if (props['type']?.value !== 'task') throw new Error('type: ' + JSON.stringify(props));
	if (props['due']?.value !== '2027-06-01') throw new Error('due');
	if (props['start']?.value !== '2026-12-01') throw new Error('start');
});

test('dynamic extraction ignores the tags toggle', () => {
	const sel = parseSelection('- x #a type: task');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ extractDynamic: true, extractTags: false, extractDates: false }),
	);
	const note = input.notes[0];
	const tags = note?.properties.tags?.value;
	if (!Array.isArray(tags) || tags.join(',') !== 'a') {
		throw new Error('tags should be extracted: ' + JSON.stringify(tags));
	}
	if (note?.properties.type?.value !== 'task') throw new Error('type');
});

test('key:value stays in the name when dynamic is off', () => {
	const sel = parseSelection('- x type: task');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const note = input.notes[0];
	if ('type' in (note?.properties ?? {})) throw new Error('type should not exist');
	if (note?.name !== 'x type task') throw new Error('name: ' + note?.name);
});

test('file name field writes the note name as a property', () => {
	const sel = parseSelection('- a b c');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ nameSeparator: 'dash', fileNameField: 'title' }),
	);
	const note = input.notes[0];
	if (note?.name !== 'a-b-c') throw new Error('name: ' + note?.name);
	if (note?.properties.title?.value !== 'a b c') throw new Error('title: ' + JSON.stringify(note?.properties));
});

test('file name field uses its own separator', () => {
	const sel = parseSelection('- a b c');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({
			nameSeparator: 'dash',
			fileNameField: 'title',
			fileNameFieldSeparator: 'underscore',
		}),
	);
	const note = input.notes[0];
	if (note?.name !== 'a-b-c') throw new Error('name: ' + note?.name);
	if (note?.properties.title?.value !== 'a_b_c') throw new Error('title: ' + JSON.stringify(note?.properties));
});

test('file name field applies to tables too', () => {
	const sel = parseSelection('| Name |\n| --- |\n| Alice Bob |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({ nameColumn: 0, columns: ['Name'], fileNameField: 'name' }),
	);
	const note = input.notes[0];
	if (note?.name !== 'Alice Bob') throw new Error('name: ' + note?.name);
	if (note?.properties.name?.value !== 'Alice Bob') throw new Error('field');
});

test('lowercase option normalizes the filename', () => {
	const sel = parseSelection('- Hello World');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ lowercaseNames: true }));
	const note = input.notes[0];
	if (note?.name !== 'hello world') throw new Error('name: ' + note?.name);
});

test('lowercase keeps original case in the name field', () => {
	const sel = parseSelection('- Hello World');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ lowercaseNames: true, fileNameField: 'title' }),
	);
	const note = input.notes[0];
	if (note?.name !== 'hello world') throw new Error('name: ' + note?.name);
	if (note?.properties.title?.value !== 'Hello World') {
		throw new Error('title: ' + JSON.stringify(note?.properties));
	}
});

test('names keep their case by default', () => {
	const sel = parseSelection('- Hello World');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	if (input.notes[0]?.name !== 'Hello World') throw new Error('name: ' + input.notes[0]?.name);
});

test('lowercase name field lowercases the property value only', () => {
	const sel = parseSelection('- Hello World');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ fileNameField: 'title', lowercaseNameField: true }),
	);
	const note = input.notes[0];
	if (note?.name !== 'Hello World') throw new Error('name: ' + note?.name);
	if (note?.properties.title?.value !== 'hello world') {
		throw new Error('title: ' + JSON.stringify(note?.properties));
	}
});

test('lowercase yaml fields lowercases property names', () => {
	const sel = parseSelection('| Name | Publication Year |\n| --- | --- |\n| Dune | 1965 |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({
			nameColumn: 0,
			columns: ['Name', 'Publication Year'],
			lowercaseYamlFields: true,
		}),
	);
	const props = input.notes[0]?.properties ?? {};
	const key = Object.keys(props)[0];
	if (key !== 'publication_year') throw new Error('expected publication_year, got ' + key);
	if (props['publication_year']?.displayName !== 'Publication Year') {
		throw new Error('displayName should keep original');
	}
});

test('lowercase yaml fields applies to extracted fields too', () => {
	const sel = parseSelection('- x Type: task');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ extractDynamic: true, lowercaseYamlFields: true }),
	);
	const props = input.notes[0]?.properties ?? {};
	const key = Object.keys(props).find((k) => k !== 'tags');
	if (key !== 'type') throw new Error('expected type, got ' + key);
	if (props['type']?.displayName !== 'Type') throw new Error('displayName');
});

test('property names keep their case by default', () => {
	const sel = parseSelection('| Name | Publication Year |\n| --- | --- |\n| Dune | 1965 |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({ nameColumn: 0, columns: ['Name', 'Publication Year'] }),
	);
	const props = input.notes[0]?.properties ?? {};
	if (!('Publication_Year' in props)) throw new Error('expected Publication_Year');
});

test('tags are deduped', () => {
	const sel = parseSelection('- x #a #a #b');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const value = input.notes[0]?.properties.tags?.value;
	if (!Array.isArray(value) || value.join(',') !== 'a,b') {
		throw new Error('dedupe: ' + JSON.stringify(value));
	}
});

test('nested tags are kept', () => {
	const sel = parseSelection('- x #project/alpha');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const value = input.notes[0]?.properties.tags?.value;
	if (!Array.isArray(value) || value.join(',') !== 'project/alpha') {
		throw new Error('nested: ' + JSON.stringify(value));
	}
});

test('tag stops at trailing punctuation', () => {
	const sel = parseSelection('- x #done.');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	const value = input.notes[0]?.properties.tags?.value;
	if (!Array.isArray(value) || value.join(',') !== 'done') {
		throw new Error('tag: ' + JSON.stringify(value));
	}
	if (input.notes[0]?.name !== 'x') throw new Error('name: ' + input.notes[0]?.name);
});

test('spaces stay by default in names', () => {
	const sel = parseSelection('- a b c');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({}));
	if (input.notes[0]?.name !== 'a b c') throw new Error('name: ' + input.notes[0]?.name);
});

test('dash separator normalizes names', () => {
	const sel = parseSelection('- a b c');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ nameSeparator: 'dash' }));
	if (input.notes[0]?.name !== 'a-b-c') throw new Error('name: ' + input.notes[0]?.name);
});

test('underscore separator normalizes names', () => {
	const sel = parseSelection('- a b c');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ nameSeparator: 'underscore' }));
	if (input.notes[0]?.name !== 'a_b_c') throw new Error('name: ' + input.notes[0]?.name);
});

test('separator applies to table names too', () => {
	const sel = parseSelection('| Name |\n| --- |\n| Alice Bob |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({ nameColumn: 0, columns: ['Name'], nameSeparator: 'dash' }),
	);
	if (input.notes[0]?.name !== 'Alice-Bob') throw new Error('name: ' + input.notes[0]?.name);
});

// ---------- table parsing ----------

test('parses a table with header and separator', () => {
	const sel = parseSelection('| Name | Age |\n| --- | --- |\n| Alice | 30 |');
	if (sel === null || sel.type !== 'table') throw new Error('not a table');
	if (sel.hasHeader !== true) throw new Error('hasHeader');
	if (sel.columns.join(',') !== 'Name,Age') throw new Error('columns');
	if (sel.rows[0]?.Name !== 'Alice') throw new Error('row');
});

test('parses a headerless table with generated columns', () => {
	const sel = parseSelection('| Alice | 30 |\n| Bob | 40 |');
	if (sel === null || sel.type !== 'table') throw new Error('not a table');
	if (sel.hasHeader !== false) throw new Error('hasHeader');
	if (sel.columns.join(',') !== 'Column 1,Column 2') throw new Error('columns');
	if (sel.rows[0]?.['Column 1'] !== 'Alice') throw new Error('row');
});

test('detects a single-row table', () => {
	const sel = parseSelection('| only | row |');
	if (sel === null || sel.type !== 'table') throw new Error('not a table');
});

test('table to notes with name column and properties', () => {
	const sel = parseSelection('| Name | Author | Year |\n| --- | --- | --- |\n| Dune | Frank Herbert | 1965 |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(sel, opts({ nameColumn: 0, columns: ['Name', 'Author', 'Year'] }));
	const note = input.notes[0];
	if (note?.name !== 'Dune') throw new Error('name');
	if (note?.properties.Author?.value !== 'Frank Herbert') throw new Error('author');
	if (note?.properties.Year?.value !== '1965') throw new Error('year');
});

test('renamed fields become property keys', () => {
	const sel = parseSelection('| Alice | 30 |\n| Bob | 40 |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({ nameColumn: 0, columns: ['Column 1', 'tags'] }),
	);
	const props = input.notes[0]?.properties ?? {};
	const key = Object.keys(props)[0];
	if (key !== 'tags') throw new Error('expected tags, got ' + key);
	if (props['tags']?.displayName !== 'tags') throw new Error('displayName');
});

test('empty renamed field falls back to Column N', () => {
	const sel = parseSelection('| Alice | 30 |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({ nameColumn: 0, columns: ['Column 1', ''] }),
	);
	const props = input.notes[0]?.properties ?? {};
	if (!('Column_2' in props)) throw new Error('expected Column_2, got ' + Object.keys(props)[0]);
	if (props['Column_2']?.displayName !== 'Column 2') throw new Error('displayName fallback');
});

// ---------- sanitization ----------

test('property keys are safe dot identifiers', () => {
	const sel = parseSelection('| a | b |\n| c | d |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({ nameColumn: 0, columns: ['Column 1', 'Publication Year'] }),
	);
	const props = input.notes[0]?.properties ?? {};
	if (!('Publication_Year' in props)) throw new Error('expected Publication_Year');
});

test('invalid filename characters are removed', () => {
	const sel = parseSelection('- A/B: C?*"<>|#^[] note');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ folder: 'f' }));
	if (input.notes[0]?.name !== 'A B C note') throw new Error('name: ' + input.notes[0]?.name);
});

test('duplicate names are deduped', async () => {
	const { app, vault } = makeApp();
	const sel = parseSelection('- Apple\n- Apple');
	if (sel === null) throw new Error('no selection');
	await createNotes(app as never, buildConvertInput(sel, opts({ folder: 'Fruit' })));
	if (!vault.store.has('Fruit/Apple.md')) throw new Error('apple missing');
	if (!vault.store.has('Fruit/Apple 2.md')) throw new Error('apple 2 missing');
});

// ---------- base content ----------

test('base filters to the notes folder', () => {
	const sel = parseSelection('- A\n- B');
	if (sel === null) throw new Error('no selection');
	const base = buildBaseContent(buildConvertInput(sel, opts({ folder: 'Books' })));
	if (!base.includes('file.folder == \\"Books\\"')) throw new Error('no folder filter');
	if (!base.includes('file.ext == \\"md\\"')) throw new Error('no ext filter');
});

test('base order uses dot form not brackets', () => {
	const sel = parseSelection('| Name | Score |\n| --- | --- |\n| A | 10 |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const base = buildBaseContent(
		buildConvertInput(sel, opts({ columns: ['Name', 'Score'] })),
	);
	if (!base.includes('      - note.Score')) throw new Error('missing note.Score');
	if (base.includes('note[')) throw new Error('bracket syntax leaked: ' + base);
});

test('task base includes status column', () => {
	const sel = parseSelection('- [x] A\n- [ ] B');
	if (sel === null) throw new Error('no selection');
	const base = buildBaseContent(buildConvertInput(sel, opts({})));
	if (!base.includes('note.status')) throw new Error('missing note.status');
});

// ---------- base file location ----------

test('base file is created in the base folder, not the notes folder', async () => {
	const { app, vault } = makeApp();
	await createBaseFile(app as never, 'Notes', 'Books', 'filters: {}');
	if (!vault.store.has('Notes/Books.base')) {
		throw new Error('expected Notes/Books.base, got ' + [...vault.store.keys()].join(', '));
	}
	if (vault.store.has('Books/Books.base')) {
		throw new Error('base file should not be in the notes folder');
	}
});

test('base file name is deduped', async () => {
	const { app, vault } = makeApp();
	await createBaseFile(app as never, 'Notes', 'Books', 'filters: {}');
	await createBaseFile(app as never, 'Notes', 'Books', 'filters: {}');
	if (!vault.store.has('Notes/Books.base')) throw new Error('first missing');
	if (!vault.store.has('Notes/Books 2.base')) throw new Error('second missing');
});

// ---------- end to end ----------

test('end to end: notes in output folder, base elsewhere, dot-form columns', async () => {
	const { app, vault } = makeApp();
	const sel = parseSelection('| Name | Score |\n| --- | --- |\n| Dune | 10 |');
	if (sel === null || sel.type !== 'table') throw new Error('no table');
	const input = buildConvertInput(
		sel,
		opts({ folder: 'Books', baseFolder: 'Notes', columns: ['Name', 'Score'] }),
	);
	await createNotes(app as never, input);
	await createBaseFile(app as never, 'Notes', input.folder, buildBaseContent(input));

	if (!vault.store.has('Books/Dune.md')) throw new Error('note not in output folder');
	if (!(vault.store.get('Books/Dune.md') ?? '').includes('Score: 10')) {
		throw new Error('note content');
	}
	if (!vault.store.has('Notes/Books.base')) throw new Error('base not in base folder');
	const base = vault.store.get('Notes/Books.base') ?? '';
	if (!base.includes('note.Score')) throw new Error('base order');
	if (base.includes('note[')) throw new Error('bracket syntax leaked');
});

test('getSelectionBlock expands around the cursor', () => {
	const fakeEditor = {
		lines: ['text before', '- Alice', '- Bob', 'text after'],
		getSelection: () => '',
		getCursor: () => ({ line: 2, ch: 0 }),
		lineCount: () => 4,
		getLine: (n: number) => fakeEditor.lines[n] ?? '',
		getRange: (from: { line: number }, to: { line: number }) =>
			fakeEditor.lines.slice(from.line, to.line + 1).join('\n'),
	};
	const block = getSelectionBlock(fakeEditor as never);
	if (block.text !== '- Alice\n- Bob') throw new Error('text: ' + block.text);
	if (block.from.line !== 1 || block.to.line !== 2) throw new Error('range');
});

void run();
