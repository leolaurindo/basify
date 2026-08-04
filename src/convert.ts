import { App, TFolder, Vault } from 'obsidian';
import { Selection } from './selection';

export interface BasifyOptions {
	folder: string;
	nameColumn: number | null;
}

export interface PropertySpec {
	displayName: string;
	value: string;
}

export interface NoteSpec {
	name: string;
	properties: Record<string, PropertySpec>;
}

export interface ConvertInput {
	folder: string;
	notes: NoteSpec[];
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

export function buildConvertInput(
	selection: Selection,
	options: BasifyOptions,
): ConvertInput {
	const folder = normalizeFolder(options.folder);

	if (selection.type === 'list') {
		return {
			folder,
			notes: selection.items.map((item) => ({
				name: sanitizeName(item),
				properties: {},
			})),
		};
	}

	const nameColumn = options.nameColumn ?? 0;
	const notes: NoteSpec[] = [];
	for (const row of selection.rows) {
		const properties: Record<string, PropertySpec> = {};
		let name = '';
		selection.columns.forEach((column, index) => {
			const value = row[column] ?? '';
			if (index === nameColumn) {
				name = value;
			} else if (value.trim() !== '') {
				properties[sanitizeProperty(column)] = {
					displayName: column,
					value,
				};
			}
		});
		if (name.trim() === '') {
			continue;
		}
		notes.push({ name: sanitizeName(name), properties });
	}

	return { folder, notes };
}

export async function convertToBase(
	app: App,
	input: ConvertInput,
): Promise<void> {
	await ensureFolder(app.vault, input.folder);

	for (const note of input.notes) {
		const path = availablePath(app.vault, input.folder, note.name, 'md');
		await app.vault.create(path, buildNoteContent(note));
	}

	const basePath = availablePath(
		app.vault,
		input.folder,
		baseName(input.folder),
		'base',
	);
	const baseFile = await app.vault.create(
		basePath,
		buildBaseFile(input.folder, input.notes),
	);
	await app.workspace.getLeaf(true).openFile(baseFile);
}

export function normalizeFolder(folder: string): string {
	return folder.replace(/^\/+|\/+$/g, '').trim();
}

function buildNoteContent(note: NoteSpec): string {
	const keys = Object.keys(note.properties);
	if (keys.length === 0) {
		return '';
	}

	const lines = ['---'];
	for (const key of keys) {
		const value = note.properties[key]?.value ?? '';
		lines.push(`${key}: ${yamlValue(value)}`);
	}
	lines.push('---');
	return lines.join('\n') + '\n';
}

function buildBaseFile(folder: string, notes: NoteSpec[]): string {
	const keys: string[] = [];
	for (const note of notes) {
		for (const key of Object.keys(note.properties)) {
			if (!keys.includes(key)) {
				keys.push(key);
			}
		}
	}

	const lines: string[] = [];
	lines.push('filters:');
	lines.push('  and:');
	lines.push(`    - "file.folder == \\"${escapeQuotes(folder)}\\""`);
	lines.push(`    - "file.ext == \\"md\\""`);

	if (keys.length > 0) {
		lines.push('properties:');
		for (const key of keys) {
			const display =
				notes.find((note) => key in note.properties)?.properties[key]
					?.displayName ?? key;
			lines.push(`  ${key}:`);
			lines.push(`    displayName: "${escapeQuotes(display)}"`);
		}
	}

	lines.push('views:');
	lines.push('  - type: table');
	lines.push('    name: Table');
	lines.push('    order:');
	lines.push('      - file.name');
	for (const key of keys) {
		lines.push(`      - note["${escapeQuotes(key)}"]`);
	}

	return lines.join('\n') + '\n';
}

function sanitizeName(input: string): string {
	const name = input
		.replace(ILLEGAL_FILENAME_CHARS, ' ')
		.replace(/\s+/g, ' ')
		.replace(/[. ]+$/g, '')
		.trim();
	return name === '' ? 'Untitled' : name;
}

function sanitizeProperty(input: string): string {
	const name = input
		.replace(ILLEGAL_FILENAME_CHARS, ' ')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
	return name === '' ? 'property' : name;
}

function yamlValue(value: string): string {
	const v = value.trim();
	if (/^(true|false|TRUE|FALSE)$/.test(v)) {
		return v.toLowerCase();
	}
	if (/^-?\d+(\.\d+)?$/.test(v)) {
		return v;
	}
	return `"${escapeQuotes(v)}"`;
}

function escapeQuotes(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function ensureFolder(vault: Vault, folder: string): Promise<void> {
	if (folder === '') {
		return;
	}
	const existing = vault.getAbstractFileByPath(folder);
	if (existing instanceof TFolder) {
		return;
	}
	if (existing !== null) {
		throw new Error(`"${folder}" is an existing file, not a folder.`);
	}
	await vault.createFolder(folder);
}

function availablePath(
	vault: Vault,
	folder: string,
	name: string,
	ext: string,
): string {
	const base = folder === '' ? name : `${folder}/${name}`;
	let path = `${base}.${ext}`;
	let index = 2;
	while (vault.getAbstractFileByPath(path) !== null) {
		path = `${base} ${index}.${ext}`;
		index++;
	}
	return path;
}

function baseName(folder: string): string {
	if (folder === '') {
		return 'Base';
	}
	return folder.split('/').pop() ?? 'Base';
}
