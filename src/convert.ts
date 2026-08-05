import { App, TFolder, TFile, Vault } from 'obsidian';
import { isTaskList, Selection } from './selection';

export interface BasifyOptions {
	folder: string;
	baseFolder: string;
	nameColumn: number | null;
	mode: 'file' | 'codeblock';
	columns: string[];
	statusField: string;
	embedBase: boolean;
	extractTags: boolean;
	extractDates: boolean;
	extractDynamic: boolean;
	nameSeparator: 'space' | 'dash' | 'underscore';
	fileNameField: string;
	fileNameFieldSeparator: 'space' | 'dash' | 'underscore';
	lowercaseNames: boolean;
	lowercaseNameField: boolean;
	lowercaseYamlFields: boolean;
}

export interface PropertySpec {
	displayName: string;
	value: string | string[];
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
const TAG_PATTERN = /#([A-Za-z0-9_/-]+)/g;
const LABELED_DATE = /\b([A-Za-z]+)\s*:\s*(\d{4}-\d{2}-\d{2})\b/g;
const AT_DATE = /@(\d{4}-\d{2}-\d{2})\b/g;
const KEY_VALUE = /\b([A-Za-z][A-Za-z0-9_-]*)\s*:\s*([^\s]+)/g;
const DATE_LABELS = [
	'due',
	'start',
	'end',
	'at',
	'date',
	'scheduled',
	'deadline',
];

export function buildConvertInput(
	selection: Selection,
	options: BasifyOptions,
): ConvertInput {
	const folder = normalizeFolder(options.folder);
	const separator = options.nameSeparator ?? 'space';
	const fileNameField = options.fileNameField.trim();
	const nameProperty =
		fileNameField !== ''
			? {
					key: propertyKey(fileNameField, options.lowercaseYamlFields),
					displayName: fileNameField,
				}
			: null;

	if (selection.type === 'list') {
		const taskList = isTaskList(selection);
		const statusName = options.statusField.trim() || 'status';
		const statusField = propertyKey(statusName, options.lowercaseYamlFields);

		const notes: NoteSpec[] = [];
		for (const item of selection.items) {
			const extracted = extractMetadata(item.text, options);
			const properties: Record<string, PropertySpec> = {};

			if (extracted.tags.length > 0) {
				properties.tags = {
					displayName: 'tags',
					value: extracted.tags,
				};
			}
			for (const [label, value] of Object.entries(extracted.fields)) {
				properties[propertyKey(label, options.lowercaseYamlFields)] = {
					displayName: label,
					value,
				};
			}

			if (taskList) {
				properties[statusField] = {
					displayName: statusName,
					value: item.done ? 'true' : 'false',
				};
			}

			const baseName = cleanName(extracted.name);
			if (nameProperty !== null) {
				properties[nameProperty.key] = {
					displayName: nameProperty.displayName,
					value: applyCase(
						applySeparator(
							baseName,
							options.fileNameFieldSeparator,
						),
						options.lowercaseNameField,
					),
				};
			}

			notes.push({
				name: applyCase(
					applySeparator(baseName, separator),
					options.lowercaseNames,
				),
				properties,
			});
		}

		return { folder, notes };
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
				const field =
					(options.columns[index] ?? column).trim() ||
					`Column ${index + 1}`;
				properties[propertyKey(field, options.lowercaseYamlFields)] = {
					displayName: field,
					value,
				};
			}
		});
		if (name.trim() === '') {
			continue;
		}
		const baseName = cleanName(name);
		if (nameProperty !== null) {
			properties[nameProperty.key] = {
				displayName: nameProperty.displayName,
				value: applyCase(
					applySeparator(
						baseName,
						options.fileNameFieldSeparator,
					),
					options.lowercaseNameField,
				),
			};
		}
		notes.push({
			name: applyCase(
				applySeparator(baseName, separator),
				options.lowercaseNames,
			),
			properties,
		});
	}

	return { folder, notes };
}

export async function createNotes(
	app: App,
	input: ConvertInput,
): Promise<void> {
	await ensureFolder(app.vault, input.folder);

	for (const note of input.notes) {
		const path = availablePath(app.vault, input.folder, note.name, 'md');
		await app.vault.create(path, buildNoteContent(note));
	}
}

export function buildBaseContent(input: ConvertInput): string {
	return buildBaseFile(input.folder, input.notes);
}

export async function createBaseFile(
	app: App,
	baseFolder: string,
	nameHint: string,
	content: string,
): Promise<TFile> {
	const basePath = availablePath(
		app.vault,
		normalizeFolder(baseFolder),
		baseName(nameHint),
		'base',
	);
	return app.vault.create(basePath, content);
}

export function normalizeFolder(folder: string): string {
	return folder.replace(/^\/+|\/+$/g, '').trim();
}

interface ExtractedMetadata {
	name: string;
	tags: string[];
	fields: Record<string, string>;
}

type MetadataCandidate =
	| { start: number; end: number; type: 'tag'; tag: string }
	| { start: number; end: number; type: 'field'; label: string; value: string };

function extractMetadata(
	text: string,
	options: BasifyOptions,
): ExtractedMetadata {
	const doTags = options.extractTags || options.extractDynamic;
	const doFields = options.extractDates || options.extractDynamic;

	const candidates: MetadataCandidate[] = [];

	if (doTags) {
		for (const match of text.matchAll(TAG_PATTERN)) {
			const tag = match[1] ?? '';
			if (tag !== '') {
				const start = match.index ?? 0;
				candidates.push({
					start,
					end: start + match[0].length,
					type: 'tag',
					tag,
				});
			}
		}
	}

	if (options.extractDynamic) {
		for (const match of text.matchAll(KEY_VALUE)) {
			const key = match[1] ?? '';
			const lowerKey = key.toLowerCase();
			if (lowerKey === '' || /^(https?|ftp)$/.test(lowerKey)) {
				continue;
			}
			const value = (match[2] ?? '').replace(/[,.;:!?]+$/g, '');
			if (value === '') {
				continue;
			}
			const start = match.index ?? 0;
			candidates.push({
				start,
				end: start + match[0].length,
				type: 'field',
				label: key,
				value,
			});
		}
	} else if (doFields) {
		for (const match of text.matchAll(LABELED_DATE)) {
			const label = match[1] ?? '';
			const date = match[2] ?? '';
			if (date === '') {
				continue;
			}
			const start = match.index ?? 0;
			candidates.push({
				start,
				end: start + match[0].length,
				type: 'field',
				label: DATE_LABELS.includes(label.toLowerCase())
					? label
					: 'date',
				value: date,
			});
		}
		for (const match of text.matchAll(AT_DATE)) {
			const date = match[1] ?? '';
			if (date === '') {
				continue;
			}
			const start = match.index ?? 0;
			candidates.push({
				start,
				end: start + match[0].length,
				type: 'field',
				label: 'date',
				value: date,
			});
		}
	}

	candidates.sort((a, b) => a.start - b.start);

	const tags: string[] = [];
	const fields: Record<string, string> = {};
	const removed: Array<{ start: number; end: number }> = [];

	for (const candidate of candidates) {
		if (candidate.type === 'tag') {
			if (!tags.includes(candidate.tag)) {
				tags.push(candidate.tag);
			}
			removed.push({ start: candidate.start, end: candidate.end });
		} else if (fields[candidate.label] === undefined) {
			fields[candidate.label] = candidate.value;
			removed.push({ start: candidate.start, end: candidate.end });
		}
	}

	let name = text;
	for (const range of removed.sort((a, b) => b.start - a.start)) {
		name = name.slice(0, range.start) + name.slice(range.end);
	}
	name = name.replace(/\s+/g, ' ').trim();

	return { name, tags, fields };
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
		lines.push(`      - note.${key}`);
	}

	return lines.join('\n') + '\n';
}

function cleanName(input: string): string {
	const name = input
		.replace(ILLEGAL_FILENAME_CHARS, ' ')
		.replace(/\s+/g, ' ')
		.replace(/[. ]+$/g, '')
		.trim();
	return name === '' ? 'Untitled' : name;
}

function applySeparator(
	name: string,
	separator: 'space' | 'dash' | 'underscore',
): string {
	if (separator === 'dash') {
		return name.replace(/ /g, '-');
	}
	if (separator === 'underscore') {
		return name.replace(/ /g, '_');
	}
	return name;
}

function applyCase(name: string, lowercase: boolean): string {
	return lowercase ? name.toLowerCase() : name;
}

function sanitizeProperty(input: string): string {
	const name = input
		.replace(/[^a-zA-Z0-9 _-]+/g, ' ')
		.replace(/[\s-]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return name === '' ? 'property' : name;
}

function propertyKey(input: string, lowercase: boolean): string {
	const key = sanitizeProperty(input);
	return lowercase ? key.toLowerCase() : key;
}

function yamlValue(value: string | string[]): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => `"${escapeQuotes(item)}"`).join(', ')}]`;
	}
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
