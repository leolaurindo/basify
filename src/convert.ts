import { App, TFolder, TFile, Vault } from 'obsidian';
import { isTaskList, Selection } from './selection';

export interface BasifyOptions {
	folder: string;
	baseFolder: string;
	nameColumn: number | null;
	mode: 'file' | 'codeblock' | 'none';
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
	sourceMode: 'keep' | 'converted' | 'all';
	conflictMode: ConflictModeValue;
	conflictSuffix: string;
	repeatedFieldMode?: RepeatedFieldMode;
	longFilenameMode?: LongFilenameMode;
	maxFilenameLength?: number;
	advancedOptions?: boolean;
}

export interface PropertySpec {
	displayName: string;
	value: string | string[];
}

export interface NoteSpec {
	name: string;
	properties: Record<string, PropertySpec>;
	sourceLine: number;
}

export type ConflictMode = 'skip' | 'suffix' | 'merge-new' | 'merge-old';
export type ConflictModeValue = ConflictMode | 'hash' | 'merge-combine';

export type RepeatedFieldMode =
	| 'list'
	| 'concatenate'
	| 'first'
	| 'last';

export type LongFilenameMode = 'shorten' | 'skip' | 'cancel';

export const DEFAULT_MAX_FILENAME_LENGTH = 120;

export class LongFilenameError extends Error {
	readonly count: number;

	constructor(count: number, maxLength: number) {
		super(
			`${count} filename${count === 1 ? '' : 's'} exceed${count === 1 ? 's' : ''} the ${maxLength}-character limit.`,
		);
		this.name = 'LongFilenameError';
		this.count = count;
	}
}

export interface NoteResult {
	sourceLine: number;
	status: 'created' | 'merged' | 'skipped';
	shortened?: boolean;
}

export interface ConvertInput {
	folder: string;
	notes: NoteSpec[];
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;
const TAG_PATTERN = /#([A-Za-z0-9_/-]+)/g;
const LABELED_DATE = /\b([A-Za-z]+)\s*:\s*(\d{4}-\d{2}-\d{2})\b/g;
const AT_DATE = /@(\d{4}-\d{2}-\d{2})\b/g;
const KEY_VALUE = /\b([A-Za-z][A-Za-z0-9_-]*)\s*:/g;
const URL_VALUE = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>()]+/g;
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
					value: formatName(
						baseName,
						options.fileNameFieldSeparator,
						options.lowercaseNameField,
					),
				};
			}

			notes.push({
				name: formatName(baseName, separator, options.lowercaseNames),
				properties,
				sourceLine: item.line,
			});
		}

		return { folder, notes };
	}

	const nameColumn = options.nameColumn ?? 0;
	const notes: NoteSpec[] = [];
	for (const [rowIndex, row] of selection.rows.entries()) {
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
				value: formatName(
					baseName,
					options.fileNameFieldSeparator,
					options.lowercaseNameField,
				),
			};
		}
		notes.push({
			name: formatName(baseName, separator, options.lowercaseNames),
			properties,
			sourceLine: selection.rowLines[rowIndex] ?? rowIndex,
		});
	}

	return { folder, notes };
}

export async function createNotes(
	app: App,
	input: ConvertInput,
	conflictMode: ConflictModeValue = 'suffix',
	conflictSuffix = '',
	longFilenameMode: LongFilenameMode = 'shorten',
	maxFilenameLength?: number,
): Promise<NoteResult[]> {
	const filenameLength = normalizeFilenameLength(maxFilenameLength);
	const longNotes = input.notes.filter(
		(note) => note.name.length > filenameLength,
	);
	if (longFilenameMode === 'cancel' && longNotes.length > 0) {
		throw new LongFilenameError(longNotes.length, filenameLength);
	}
	logDebug('prepare-notes', {
		count: input.notes.length,
		conflictMode,
		longFilenameMode,
		maxFilenameLength: filenameLength,
	});
	await ensureFolder(app.vault, input.folder);
	const results: NoteResult[] = [];

	for (const originalNote of input.notes) {
		const isLong = originalNote.name.length > filenameLength;
		if (isLong && longFilenameMode === 'skip') {
			logDebug('note-skipped', {
				sourceLine: originalNote.sourceLine,
				reason: 'filename-too-long',
				nameLength: originalNote.name.length,
			});
			results.push({ sourceLine: originalNote.sourceLine, status: 'skipped' });
			continue;
		}
		const shortened = isLong;
		if (shortened) {
			logDebug('filename-shortened', {
				sourceLine: originalNote.sourceLine,
				originalLength: originalNote.name.length,
				maxLength: filenameLength,
			});
		}
		const note = isLong
			? { ...originalNote, name: shortenFilename(originalNote.name, filenameLength) }
			: originalNote;
		const path = joinPath(input.folder, note.name, 'md');
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing === null) {
			await app.vault.create(path, buildNoteContent(note));
			logDebug('note-created', {
				sourceLine: note.sourceLine,
				nameLength: note.name.length,
				shortened,
			});
			results.push({ sourceLine: note.sourceLine, status: 'created', shortened });
			continue;
		}

		if (conflictMode === 'suffix' || conflictMode === 'hash') {
			logDebug('note-conflict', {
				sourceLine: note.sourceLine,
				mode: conflictMode,
			});
			const suffix =
				conflictMode === 'hash'
					? shortHash(originalNote.name)
					: conflictSuffix.trim();
			const conflictName = cleanName(
				suffix === '' ? note.name : `${note.name} ${suffix}`,
			);
			const available = availablePath(
				app.vault,
				input.folder,
				conflictName,
				'md',
			);
			await app.vault.create(available, buildNoteContent(note));
			logDebug('note-created', {
				sourceLine: note.sourceLine,
				nameLength: note.name.length,
				shortened,
			});
			results.push({ sourceLine: note.sourceLine, status: 'created', shortened });
			continue;
		}

		if (
			existing instanceof TFile &&
			(conflictMode === 'merge-new' ||
				conflictMode === 'merge-old' ||
				conflictMode === 'merge-combine')
		) {
			logDebug('note-conflict', {
				sourceLine: note.sourceLine,
				mode: conflictMode,
			});
			await app.fileManager.processFrontMatter(existing, (frontmatter) => {
				const existingProperties = frontmatter as Record<string, unknown>;
				for (const [key, property] of Object.entries(note.properties)) {
					const incomingValue = typedValue(property.value);
					if (existingProperties[key] === undefined) {
						existingProperties[key] = incomingValue;
					} else if (conflictMode === 'merge-new') {
						existingProperties[key] = incomingValue;
					} else if (
						conflictMode === 'merge-combine' &&
						!samePropertyValue(existingProperties[key], incomingValue)
					) {
						existingProperties[key] = combinePropertyValues(
							existingProperties[key],
							incomingValue,
						);
					}
				}
			});
			logDebug('note-merged', {
				sourceLine: note.sourceLine,
				mode: conflictMode,
				shortened,
			});
			results.push({ sourceLine: note.sourceLine, status: 'merged', shortened });
			continue;
		}

		results.push({ sourceLine: note.sourceLine, status: 'skipped' });
		logDebug('note-skipped', {
			sourceLine: note.sourceLine,
			reason: 'conflict',
		});
	}

	return results;
}

function normalizeFilenameLength(length: number | undefined): number {
	return Number.isInteger(length) && (length as number) > 3
		? (length as number)
		: DEFAULT_MAX_FILENAME_LENGTH;
}

export function shortenFilename(name: string, maxLength: number): string {
	if (name.length <= maxLength) {
		return name;
	}
	if (maxLength <= 3) {
		return name.slice(0, maxLength);
	}

	const lastWordMatch = name.match(/\S+$/);
	const lastWord = lastWordMatch?.[0] ?? '';
	const prefixLimit = maxLength - 3 - lastWord.length;
	if (lastWord === '' || prefixLimit <= 0) {
		const available = maxLength - 3;
		const prefixLength = Math.max(1, Math.floor(available / 2));
		const suffixLength = available - prefixLength;
		return `${name.slice(0, prefixLength)}...${name.slice(-suffixLength)}`;
	}

	const prefixCandidate = name.slice(0, prefixLimit).trimEnd();
	const boundary = prefixCandidate.lastIndexOf(' ');
	const prefix =
		boundary > 0 ? prefixCandidate.slice(0, boundary).trimEnd() : prefixCandidate;
	return `${prefix}...${lastWord}`;
}

export function shortHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function samePropertyValue(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) || Array.isArray(right)) {
		const leftValues = propertyValues(left);
		const rightValues = propertyValues(right);
		return (
			leftValues.length === rightValues.length &&
			leftValues.every((value, index) => Object.is(value, rightValues[index]))
		);
	}
	return Object.is(left, right);
}

function combinePropertyValues(left: unknown, right: unknown): unknown[] {
	const values = [...propertyValues(left), ...propertyValues(right)];
	return values.filter(
		(value, index) => values.findIndex((candidate) => Object.is(candidate, value)) === index,
	);
}

function propertyValues(value: unknown): unknown[] {
	return Array.isArray(value) ? (value as unknown[]) : [value];
}

function logDebug(event: string, details: Record<string, unknown>): void {
	console.debug(`[Basify] ${event}`, details);
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
	fields: Record<string, string | string[]>;
}

type MetadataCandidate =
	| { start: number; end: number; type: 'tag'; tag: string }
	| {
			start: number;
			end: number;
			type: 'field';
			label: string;
			value: string | string[];
			repeatable?: boolean;
	  };

function extractMetadata(
	text: string,
	options: BasifyOptions,
): ExtractedMetadata {
	const doTags = options.extractTags || options.extractDynamic;
	const doFields = options.extractDates || options.extractDynamic;

	const candidates: MetadataCandidate[] = [];
	const urlRanges = [...text.matchAll(URL_VALUE)].map((match) => {
		const start = match.index ?? 0;
		return { start, end: start + match[0].length };
	});

	if (doTags) {
		for (const match of text.matchAll(TAG_PATTERN)) {
			const tag = match[1] ?? '';
			if (tag !== '') {
				const start = match.index ?? 0;
				if (
					urlRanges.some(
						(range) => start < range.end && start + match[0].length > range.start,
					)
				) {
					continue;
				}
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
		const fields = [...text.matchAll(KEY_VALUE)].flatMap((match) => {
			const key = match[1] ?? '';
			const start = match.index ?? 0;
			const valueStart = start + match[0].length;
			const lowerKey = key.toLowerCase();
			if (
				lowerKey === '' ||
				/^(https?|ftp)$/.test(lowerKey) ||
				text.slice(valueStart, valueStart + 2) === '//' ||
				urlRanges.some((range) => start >= range.start && start < range.end)
			) {
				return [];
			}
			return [{ key, start, valueStart }];
		});
		for (let index = 0; index < fields.length; index++) {
			const field = fields[index];
			if (field === undefined) {
				continue;
			}
			let nextIndex = index + 1;
			const parsed = parseDynamicValue(
				text,
				field.valueStart,
				fields[nextIndex]?.start ?? text.length,
			);
			while (
				fields[nextIndex] !== undefined &&
				(fields[nextIndex]?.start ?? parsed.end) < parsed.end
			) {
				nextIndex++;
			}
			const rawValue = parsed.value;
			if (rawValue === '') {
				index = nextIndex - 1;
				continue;
			}
			const value = Array.isArray(rawValue)
				? rawValue
				: isUrlValue(rawValue)
					? rawValue
					: rawValue.replace(/[,.;:!?]+$/g, '');
			if (value === '') {
				index = nextIndex - 1;
				continue;
			}
			candidates.push({
				start: field.start,
				end: parsed.end,
				type: 'field',
				label: field.key,
				value,
				repeatable: true,
			});
			index = nextIndex - 1;
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
	const fields: Record<string, string | string[]> = {};
	const removed: Array<{ start: number; end: number }> = [];
	const repeatedFieldMode = options.repeatedFieldMode ?? 'list';

	for (const candidate of candidates) {
		if (candidate.type === 'tag') {
			if (!tags.includes(candidate.tag)) {
				tags.push(candidate.tag);
			}
			removed.push({ start: candidate.start, end: candidate.end });
		} else {
			const existing = fields[candidate.label];
			if (existing === undefined) {
				fields[candidate.label] = candidate.value;
				removed.push({ start: candidate.start, end: candidate.end });
			} else if (candidate.repeatable) {
				if (repeatedFieldMode === 'last') {
					fields[candidate.label] = candidate.value;
				} else if (repeatedFieldMode === 'first') {
					// Keep the first value while still removing every occurrence below.
				} else if (repeatedFieldMode === 'concatenate') {
					fields[candidate.label] = `${fieldValueText(existing)}; ${fieldValueText(candidate.value)}`;
				} else {
					fields[candidate.label] = [
						...(Array.isArray(existing) ? existing : [existing]),
						...(Array.isArray(candidate.value)
							? candidate.value
							: [candidate.value]),
					];
				}
				removed.push({ start: candidate.start, end: candidate.end });
			}
		}
	}

	let name = text;
	for (const range of removed.sort((a, b) => b.start - a.start)) {
		name = name.slice(0, range.start) + name.slice(range.end);
	}
	name = name.replace(/\s+/g, ' ').trim();

	return { name, tags, fields };
}

function fieldValueText(value: string | string[]): string {
	return Array.isArray(value) ? value.join('; ') : value;
}

function isUrlValue(value: string): boolean {
	return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value);
}

function skipWhitespace(text: string, start: number): number {
	let index = start;
	while (/\s/.test(text[index] ?? '')) {
		index++;
	}
	return index;
}

function closingQuote(text: string, start: number, quote: string): number {
	for (let index = start + 1; index < text.length; index++) {
		if (text[index] === '\\') {
			index++;
			continue;
		}
		if (text[index] === quote) {
			return index;
		}
	}
	return -1;
}

function parseDynamicValue(
	text: string,
	start: number,
	plainEnd: number,
): { value: string | string[]; end: number } {
	const valueStart = skipWhitespace(text, start);
	const first = text[valueStart];
	const bracketList = first === '[' ? parseBracketList(text, valueStart) : null;
	if (bracketList !== null) {
		return { value: bracketList.values, end: bracketList.end };
	}
	if (first !== '"' && first !== "'") {
		return { value: text.slice(start, plainEnd).trim(), end: plainEnd };
	}
	const quoteEnd = closingQuote(text, valueStart, first);
	return quoteEnd === -1
		? { value: text.slice(start, plainEnd).trim(), end: plainEnd }
		: {
				value: unescapeQuotedValue(text.slice(valueStart + 1, quoteEnd), first),
				end: quoteEnd + 1,
			};
}

function parseBracketList(
	text: string,
	start: number,
): { values: string[]; end: number } | null {
	const values: string[] = [];
	let itemStart = start + 1;
	let quote = '';

	for (let index = itemStart; index < text.length; index++) {
		const character = text[index] ?? '';
		if (quote !== '') {
			if (character === '\\') {
				index++;
			} else if (character === quote) {
				quote = '';
			}
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character !== ',' && character !== ']') {
			continue;
		}

		const raw = text.slice(itemStart, index).trim();
		if (raw === '') {
			return character === ']' && values.length === 0
				? { values, end: index + 1 }
				: null;
		}
		const itemQuote = raw[0];
		const lastCharacter = raw[raw.length - 1];
		values.push(
			(itemQuote === '"' || itemQuote === "'") && lastCharacter === itemQuote
				? unescapeQuotedValue(raw.slice(1, -1), itemQuote)
				: raw,
		);
		if (character === ']') {
			return { values, end: index + 1 };
		}
		itemStart = index + 1;
	}
	return null;
}

function unescapeQuotedValue(value: string, quote: '"' | "'"): string {
	return value.replace(new RegExp(`\\\\([\\\\${quote}])`, 'g'), '$1');
}

function buildNoteContent(note: NoteSpec): string {
	const keys = Object.keys(note.properties);
	if (keys.length === 0) {
		return '';
	}

	const lines = ['---'];
	for (const key of keys) {
		const value = note.properties[key]?.value ?? '';
		if (Array.isArray(value)) {
			lines.push(value.length === 0 ? `${key}: []` : `${key}:`);
			for (const item of value) {
				const serialized = key === 'tags' ? yamlText(item, true) : yamlValue(item);
				lines.push(`  - ${serialized}`);
			}
		} else {
			lines.push(`${key}: ${yamlValue(value)}`);
		}
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

function formatName(
	name: string,
	separator: 'space' | 'dash' | 'underscore',
	lowercase: boolean,
): string {
	const formatted =
		separator === 'dash'
			? name.replace(/ /g, '-')
			: separator === 'underscore'
				? name.replace(/ /g, '_')
				: name;
	return lowercase ? formatted.toLowerCase() : formatted;
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

function yamlValue(value: string): string {
	const typed = typedValue(value);
	if (typeof typed !== 'string') {
		return String(typed);
	}
	return yamlText(typed);
}

function yamlText(value: string, preserveString = false): string {
	const unsafe =
		value === '' ||
		(preserveString &&
			/^(?:true|false|null|~|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?|\.nan|[-+]?\.inf)$/i.test(
				value,
			)) ||
		/^[\s!&*{},#|>@`"'%?:-]/.test(value) ||
		value.startsWith('[') ||
		value.startsWith(']') ||
		/(?:\s#|:\s|:$|[\r\n\t])/.test(value) ||
		/^(?:null|~|\.nan|[-+]?\.inf)$/i.test(value);
	return unsafe ? JSON.stringify(value) : value;
}

function typedValue(value: string | string[]): string | string[] | boolean | number {
	if (Array.isArray(value)) {
		return value;
	}
	const trimmed = value.trim();
	if (/^(true|false)$/i.test(trimmed)) {
		return trimmed.toLowerCase() === 'true';
	}
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		return Number(trimmed);
	}
	return trimmed;
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
	let path = joinPath(folder, name, ext);
	let index = 2;
	while (vault.getAbstractFileByPath(path) !== null) {
		path = `${base} ${index}.${ext}`;
		index++;
	}
	return path;
}

function joinPath(folder: string, name: string, ext: string): string {
	return `${folder === '' ? name : `${folder}/${name}`}.${ext}`;
}

function baseName(folder: string): string {
	if (folder === '') {
		return 'Base';
	}
	return folder.split('/').pop() ?? 'Base';
}
