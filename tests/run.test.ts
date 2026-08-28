import {
	App,
	FileManager,
	TFolder,
	TFile,
	Vault,
	Workspace,
	WorkspaceLeaf,
} from './obsidian-stub';
import {
	getSelectionBlock,
	isTaskList,
	parseSelection,
	removeSelectionEntries,
} from '../src/selection';
import {
	BasifyOptions,
	buildBaseContent,
	buildConvertInput,
	createBaseFile,
	createNotes,
	LongFilenameError,
	shortHash,
	shortenFilename,
} from '../src/convert';
import {
	DEFAULT_MEMORY,
	loadFileMemories,
	MAX_FILE_MEMORIES,
	removeFileMemory,
	renameFileMemory,
	saveFileMemory,
} from '../src/memory';

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

class FakeFileManager extends FileManager {
	constructor(private readonly vault: FakeVault) {
		super();
	}

	async processFrontMatter(
		file: TFile,
		callback: (frontmatter: Record<string, unknown>) => void,
	): Promise<void> {
		const content = this.vault.store.get(file.path) ?? '';
		const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
		const frontmatter: Record<string, unknown> = {};
		for (const line of (match?.[1] ?? '').split('\n')) {
			const separator = line.indexOf(':');
			if (separator < 0) continue;
			const key = line.slice(0, separator);
			const raw = line.slice(separator + 1).trim();
			try {
				frontmatter[key] = JSON.parse(raw);
			} catch {
				frontmatter[key] = raw;
			}
		}
		callback(frontmatter);
		const yaml = Object.entries(frontmatter)
			.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
			.join('\n');
		this.vault.store.set(
			file.path,
			`---\n${yaml}\n---\n${content.slice(match?.[0].length ?? 0)}`,
		);
	}
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
	app.fileManager = new FakeFileManager(vault);
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
		sourceMode: 'converted',
		conflictMode: 'skip',
		conflictSuffix: 'copy',
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

test('file memories are bounded and maintained by file lifecycle', () => {
	let memories = loadFileMemories(null);
	for (let index = 0; index <= MAX_FILE_MEMORIES; index++) {
		memories = saveFileMemory(memories, `Note ${index}.md`, {
			...DEFAULT_MEMORY,
			lastFolder: `Folder ${index}`,
		});
	}
	if (Object.keys(memories).length !== MAX_FILE_MEMORIES) {
		throw new Error('file memory limit was not applied');
	}
	if (memories['Note 0.md'] !== undefined) {
		throw new Error('oldest file memory was retained');
	}

	memories = renameFileMemory(memories, 'Note 1.md', 'Renamed.md');
	if (memories['Note 1.md'] !== undefined) {
		throw new Error('old file path was retained');
	}
	if (memories['Renamed.md']?.lastFolder !== 'Folder 1') {
		throw new Error('file memory was not migrated');
	}

	memories = removeFileMemory(memories, 'Renamed.md');
	if (memories['Renamed.md'] !== undefined) {
		throw new Error('deleted file memory was retained');
	}
});

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

test('dynamic extraction preserves complete URL values', () => {
	const sel = parseSelection(
		'- project url:https://example.com/a_b~c/*?x=1#section',
	);
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ extractDynamic: true }));
	const note = input.notes[0];
	if (
		note?.properties.url?.value !==
		'https://example.com/a_b~c/*?x=1#section'
	) {
		throw new Error('url: ' + JSON.stringify(note?.properties.url?.value));
	}
	if ('tags' in (note?.properties ?? {})) {
		throw new Error('URL fragment became a tag');
	}
	if (note?.name !== 'project') throw new Error('name: ' + note?.name);
});

test('dynamic extraction preserves URL trailing punctuation', () => {
	const sel = parseSelection(
		'- links url:https://example.com/path?; source:ftp://example.com/file!',
	);
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ extractDynamic: true }));
	const properties = input.notes[0]?.properties ?? {};
	if (properties.url?.value !== 'https://example.com/path?;') {
		throw new Error('url punctuation: ' + JSON.stringify(properties.url?.value));
	}
	if (properties.source?.value !== 'ftp://example.com/file!') {
		throw new Error('source punctuation: ' + JSON.stringify(properties.source?.value));
	}
});

test('dynamic extraction preserves URL-valued fields beyond url', () => {
	const sel = parseSelection('- project source:ftp://example.com/file.txt?raw=1');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ extractDynamic: true }));
	if (
		input.notes[0]?.properties.source?.value !==
		'ftp://example.com/file.txt?raw=1'
	) {
		throw new Error('source URL');
	}
});

test('dynamic extraction keeps repeated fields as a list by default', () => {
	const sel = parseSelection(
		'- project url:https://example.com/one url:https://example.com/two',
	);
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ extractDynamic: true }));
	const value = input.notes[0]?.properties.url?.value;
	if (
		!Array.isArray(value) ||
		value.join(',') !== 'https://example.com/one,https://example.com/two'
	) {
		throw new Error('urls: ' + JSON.stringify(value));
	}
	if (input.notes[0]?.name !== 'project') {
		throw new Error('name: ' + input.notes[0]?.name);
	}
});

test('dynamic extraction can concatenate repeated fields', () => {
	const sel = parseSelection('- x type:one type:two');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ extractDynamic: true, repeatedFieldMode: 'concatenate' }),
	);
	if (input.notes[0]?.properties.type?.value !== 'one; two') {
		throw new Error('concatenated value');
	}
});

test('dynamic extraction can keep the first repeated field', () => {
	const sel = parseSelection('- x type:one type:two');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ extractDynamic: true, repeatedFieldMode: 'first' }),
	);
	if (input.notes[0]?.properties.type?.value !== 'one') {
		throw new Error('first value');
	}
});

test('dynamic extraction can keep the last repeated field', () => {
	const sel = parseSelection('- x type:one type:two');
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(
		sel,
		opts({ extractDynamic: true, repeatedFieldMode: 'last' }),
	);
	if (input.notes[0]?.properties.type?.value !== 'two') {
		throw new Error('last value');
	}
});

test('dynamic extraction preserves a URL in a markdown field link', () => {
	const sel = parseSelection(
		'- project url:[repository](https://github.com/example/repo_name#readme)',
	);
	if (sel === null) throw new Error('no selection');
	const input = buildConvertInput(sel, opts({ extractDynamic: true }));
	if (
		input.notes[0]?.properties.url?.value !==
		'https://github.com/example/repo_name#readme'
	) {
		throw new Error('markdown URL');
	}
	if (input.notes[0]?.name !== 'project') {
		throw new Error('name: ' + input.notes[0]?.name);
	}
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

test('shortened filenames preserve the beginning and last word', () => {
	const name = shortenFilename(
		'experiment ts2vec tcn and lstm on electricity demand datasets',
		30,
	);
	if (name.length > 30) throw new Error('too long: ' + name);
	if (!name.startsWith('experiment ts2vec')) throw new Error('beginning: ' + name);
	if (!name.endsWith('datasets')) throw new Error('last word: ' + name);
	if (!name.includes('...')) throw new Error('ellipsis: ' + name);
});

test('long filenames are shortened before note creation', async () => {
	const { app, vault } = makeApp();
	const sel = parseSelection('- alpha beta gamma delta epsilon zeta');
	if (sel === null) throw new Error('no selection');
	const results = await createNotes(
		app as never,
		buildConvertInput(sel, opts({ folder: 'Long' })),
		'skip',
		'',
		'shorten',
		20,
	);
	const path = [...vault.store.keys()].find((key) => key.startsWith('Long/'));
	if (path === undefined || path.length > 'Long/'.length + 20 + 3) {
		throw new Error('path: ' + path);
	}
	if (results[0]?.shortened !== true) throw new Error('not marked shortened');
});

test('long filenames can be skipped', async () => {
	const { app, vault } = makeApp();
	const sel = parseSelection('- alpha beta gamma');
	if (sel === null) throw new Error('no selection');
	const results = await createNotes(
		app as never,
		buildConvertInput(sel, opts()),
		'skip',
		'',
		'skip',
		10,
	);
	if (results[0]?.status !== 'skipped') throw new Error('not skipped');
	if (vault.store.has('alpha beta gamma.md')) throw new Error('created');
});

test('long filenames can cancel before creating files', async () => {
	const { app, vault } = makeApp();
	const sel = parseSelection('- alpha beta gamma');
	if (sel === null) throw new Error('no selection');
	try {
		await createNotes(
			app as never,
			buildConvertInput(sel, opts()),
			'skip',
			'',
			'cancel',
			10,
		);
		throw new Error('did not cancel');
	} catch (error) {
		if (!(error instanceof LongFilenameError)) throw error;
	}
	if (vault.store.size !== 0) throw new Error('created before cancellation');
});

test('conversion logging uses safe metadata only', async () => {
	const { app } = makeApp();
	const sel = parseSelection('- private project url:https://example.com/private');
	if (sel === null) throw new Error('no selection');
	const messages: unknown[][] = [];
	const debug = console.debug;
	console.debug = (...args: unknown[]) => messages.push(args);
	try {
		await createNotes(app as never, buildConvertInput(sel, opts({ folder: 'Private' })));
	} finally {
		console.debug = debug;
	}
	if (messages.length === 0) throw new Error('no debug logs');
	if (messages.some((message) => JSON.stringify(message).includes('private'))) {
		throw new Error('logged note contents');
	}
	if (!messages.some((message) => message[0] === '[Basify] note-created')) {
		throw new Error('missing creation log');
	}
});

test('duplicate names are deduped', async () => {
	const { app, vault } = makeApp();
	const sel = parseSelection('- Apple\n- Apple');
	if (sel === null) throw new Error('no selection');
	await createNotes(app as never, buildConvertInput(sel, opts({ folder: 'Fruit' })));
	if (!vault.store.has('Fruit/Apple.md')) throw new Error('apple missing');
	if (!vault.store.has('Fruit/Apple 2.md')) throw new Error('apple 2 missing');
});

test('existing notes can be skipped', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Fruit/Apple.md', 'original');
	const sel = parseSelection('- Apple');
	if (sel === null) throw new Error('no selection');
	const results = await createNotes(
		app as never,
		buildConvertInput(sel, opts({ folder: 'Fruit' })),
		'skip',
	);
	if (results[0]?.status !== 'skipped') throw new Error('not skipped');
	if (vault.store.get('Fruit/Apple.md') !== 'original') throw new Error('changed');
});

test('custom conflict suffix is numbered after further conflicts', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Fruit/Apple.md', 'original');
	vault.store.set('Fruit/Apple copy.md', 'first copy');
	const sel = parseSelection('- Apple');
	if (sel === null) throw new Error('no selection');
	await createNotes(
		app as never,
		buildConvertInput(sel, opts({ folder: 'Fruit' })),
		'suffix',
		'copy',
	);
	if (!vault.store.has('Fruit/Apple copy 2.md')) throw new Error('copy missing');
});

test('hash conflict mode creates a deterministic hash suffix', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Fruit/Apple.md', 'original');
	const sel = parseSelection('- Apple');
	if (sel === null) throw new Error('no selection');
	const results = await createNotes(
		app as never,
		buildConvertInput(sel, opts({ folder: 'Fruit' })),
		'hash',
	);
	const expected = `Fruit/Apple ${shortHash('Apple')}.md`;
	if (!vault.store.has(expected)) throw new Error('hash file missing');
	if (results[0]?.status !== 'created') throw new Error('not created');
});

test('hash conflict mode numbers repeated hash collisions', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Fruit/Apple.md', 'original');
	const sel = parseSelection('- Apple\n- Apple');
	if (sel === null) throw new Error('no selection');
	await createNotes(
		app as never,
		buildConvertInput(sel, opts({ folder: 'Fruit' })),
		'hash',
	);
	const hash = shortHash('Apple');
	if (!vault.store.has(`Fruit/Apple ${hash}.md`)) throw new Error('first hash missing');
	if (!vault.store.has(`Fruit/Apple ${hash} 2.md`)) {
		throw new Error('numbered hash missing');
	}
});

test('merge can prefer new properties and preserves the body', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Books/Dune.md', '---\nScore: 1\nkept: "yes"\n---\nBody\n');
	const sel = parseSelection('| Name | Score | Added |\n| --- | --- | --- |\n| Dune | 2 | new |');
	if (sel === null) throw new Error('no selection');
	const results = await createNotes(
		app as never,
		buildConvertInput(sel, opts({ columns: ['Name', 'Score', 'Added'] })),
		'merge-new',
	);
	const content = vault.store.get('Books/Dune.md') ?? '';
	if (results[0]?.status !== 'merged') throw new Error('not merged');
	if (!content.includes('Score: 2')) throw new Error('new value missing: ' + content);
	if (!content.includes('kept: "yes"')) throw new Error('old property missing');
	if (!content.endsWith('Body\n')) throw new Error('body changed');
});

test('merge can prefer existing properties', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Books/Dune.md', '---\nScore: 1\n---\nBody');
	const sel = parseSelection('| Name | Score | Added |\n| --- | --- | --- |\n| Dune | 2 | new |');
	if (sel === null) throw new Error('no selection');
	await createNotes(
		app as never,
		buildConvertInput(sel, opts({ columns: ['Name', 'Score', 'Added'] })),
		'merge-old',
	);
	const content = vault.store.get('Books/Dune.md') ?? '';
	if (!content.includes('Score: 1')) throw new Error('old value replaced');
	if (!content.includes('Added: "new"')) throw new Error('new property missing');
});

test('merge treats list properties as whole values', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Books/Apple.md', '---\ntags: ["old"]\n---\nBody');
	const sel = parseSelection('- Apple #new');
	if (sel === null) throw new Error('no selection');
	await createNotes(
		app as never,
		buildConvertInput(sel, opts()),
		'merge-new',
	);
	const content = vault.store.get('Books/Apple.md') ?? '';
	if (!content.includes('tags: ["new"]')) throw new Error('tags not replaced');
});

test('merge combine turns conflicting scalars into an ordered list', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Books/Dune.md', '---\nScore: 1\n---\nBody');
	const sel = parseSelection('| Name | Score | Added |\n| --- | --- | --- |\n| Dune | 2 | new |');
	if (sel === null) throw new Error('no table');
	await createNotes(
		app as never,
		buildConvertInput(sel, opts({ columns: ['Name', 'Score', 'Added'] })),
		'merge-combine',
	);
	const content = vault.store.get('Books/Dune.md') ?? '';
	if (!content.includes('Score: [1,2]')) throw new Error('score list: ' + content);
	if (!content.includes('Added: "new"')) throw new Error('missing property');
});

test('merge combine flattens and deduplicates list values', async () => {
	const { app, vault } = makeApp();
	vault.store.set('Books/Apple.md', '---\ntags: ["old", "shared"]\n---\nBody');
	const sel = parseSelection('- Apple #shared #new');
	if (sel === null) throw new Error('no list');
	await createNotes(app as never, buildConvertInput(sel, opts()), 'merge-combine');
	const content = vault.store.get('Books/Apple.md') ?? '';
	if (!content.includes('tags: ["old","shared","new"]')) {
		throw new Error('tags list: ' + content);
	}
});

test('source cleanup keeps skipped list entries and their children', () => {
	const source = '- Apple\n  - detail\n- Pear';
	const sel = parseSelection(source);
	if (sel === null) throw new Error('no selection');
	const cleaned = removeSelectionEntries(source, sel, new Set([2]));
	if (cleaned !== '- Apple\n  - detail') throw new Error('cleaned: ' + cleaned);
});

test('source cleanup keeps table headers for skipped rows', () => {
	const source = '| Name | Score |\n| --- | --- |\n| A | 1 |\n| B | 2 |';
	const sel = parseSelection(source);
	if (sel === null) throw new Error('no selection');
	const cleaned = removeSelectionEntries(source, sel, new Set([2]));
	if (!cleaned.includes('| Name | Score |\n| --- | --- |\n| B | 2 |')) {
		throw new Error('cleaned: ' + cleaned);
	}
});

test('source cleanup removes the whole block when all entries are handled', () => {
	const source = '| Name |\n| --- |\n| A |';
	const sel = parseSelection(source);
	if (sel === null) throw new Error('no selection');
	if (removeSelectionEntries(source, sel, new Set([2])) !== '') {
		throw new Error('table remains');
	}
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

test('getSelectionBlock expands a partial selection to complete lines', () => {
	const lines = ['before', '- lista', '- listas', '- lista', 'after'];
	const fakeEditor = {
		getSelection: () => 'lista\n- listas\n- list',
		getCursor: (which: string) =>
			which === 'from' ? { line: 1, ch: 2 } : { line: 3, ch: 6 },
		getLine: (line: number) => lines[line] ?? '',
		getRange: (from: { line: number; ch: number }, to: { line: number; ch: number }) =>
			lines
				.slice(from.line, to.line + 1)
				.map((line, index) =>
					index === 0
						? line.slice(from.ch, from.line === to.line ? to.ch : undefined)
						: index === to.line - from.line
							? line.slice(0, to.ch)
							: line,
				)
				.join('\n'),
	};
	const block = getSelectionBlock(fakeEditor as never);
	if (block.text !== '- lista\n- listas\n- lista') {
		throw new Error('text: ' + block.text);
	}
	if (block.from.ch !== 0 || block.to.ch !== 7) throw new Error('range');
});

test('getSelectionBlock excludes a following line selected only at column zero', () => {
	const lines = ['- A', '- B', 'not selected'];
	const fakeEditor = {
		getSelection: () => '- A\n- B\n',
		getCursor: (which: string) =>
			which === 'from' ? { line: 0, ch: 0 } : { line: 2, ch: 0 },
		getLine: (line: number) => lines[line] ?? '',
		getRange: (from: { line: number }, to: { line: number }) =>
			lines.slice(from.line, to.line + 1).join('\n'),
	};
	const block = getSelectionBlock(fakeEditor as never);
	if (block.text !== '- A\n- B') throw new Error('text: ' + block.text);
	if (block.to.line !== 1) throw new Error('included following line');
});

void run();
