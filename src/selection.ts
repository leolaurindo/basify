import { Editor, EditorPosition } from 'obsidian';

export type Selection = TableSelection | ListSelection;

export interface TableSelection {
	type: 'table';
	columns: string[];
	rows: Record<string, string>[];
	rowLines: number[];
	hasHeader: boolean;
}

export interface ListItem {
	text: string;
	done: boolean | null;
	line: number;
}

export interface ListSelection {
	type: 'list';
	items: ListItem[];
}

export interface SelectionBlock {
	text: string;
	from: EditorPosition;
	to: EditorPosition;
}

const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s/;

export function getSelectionBlock(editor: Editor): SelectionBlock {
	const selection = editor.getSelection();
	const from = editor.getCursor('from');
	const to = editor.getCursor('to');
	if (selection.trim() !== '') {
		return { text: selection, from, to };
	}

	const cursor = editor.getCursor();
	const lastLine = editor.lineCount() - 1;
	let start = cursor.line;
	let end = cursor.line;

	while (start > 0 && isBlockLine(editor.getLine(start - 1))) {
		start--;
	}
	while (end < lastLine && isBlockLine(editor.getLine(end + 1))) {
		end++;
	}

	return {
		text: editor.getRange(
			{ line: start, ch: 0 },
			{ line: end, ch: editor.getLine(end).length },
		),
		from: { line: start, ch: 0 },
		to: { line: end, ch: editor.getLine(end).length },
	};
}

function isBlockLine(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith('|') || LIST_MARKER.test(trimmed);
}

export function parseSelection(text: string): Selection | null {
	const lines = text.split(/\r?\n/);
	const firstLine = lines.find((line) => line.trim() !== '') ?? '';
	if (/^\s*\|/.test(firstLine)) {
		return parseTable(
			lines
				.map((text, line) => ({ text, line }))
				.filter(({ text }) => /^\s*\|/.test(text)),
		);
	}
	return parseList(lines);
}

function parseTable(lines: Array<{ text: string; line: number }>): TableSelection | null {
	const hasSeparator =
		lines.length >= 2 && isSeparatorRow(lines[1]?.text ?? '');
	const headerLine: string | null = hasSeparator
		? lines[0]?.text ?? ''
		: null;
	const dataLines = hasSeparator ? lines.slice(2) : lines;

	const sampleRow = parseRow(headerLine ?? (dataLines[0]?.text ?? ''));
	if (sampleRow.length === 0) {
		return null;
	}

	const columns =
		headerLine !== null
			? parseRow(headerLine)
			: sampleRow.map((_cell, index) => `Column ${index + 1}`);

	const rows: Record<string, string>[] = [];
	const rowLines: number[] = [];
	for (const { text, line } of dataLines) {
		const cells = parseRow(text);
		if (cells.length === 0) {
			continue;
		}
		const row: Record<string, string> = {};
		columns.forEach((column, index) => {
			row[column] = cells[index] ?? '';
		});
		rows.push(row);
		rowLines.push(line);
	}

	return { type: 'table', columns, rows, rowLines, hasHeader: hasSeparator };
}

function isSeparatorRow(line: string): boolean {
	return parseRow(line).every(
		(cell) => cell === '' || /^:?-+:?$/.test(cell),
	);
}

function parseRow(line: string): string[] {
	return line
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((cell) => cell.trim());
}

function parseList(lines: string[]): ListSelection | null {
	const plain = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
	const task = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/;
	let baseIndent: string | null = null;
	const items: ListItem[] = [];

	for (const [lineNumber, line] of lines.entries()) {
		const taskMatch = line.match(task);
		const match = taskMatch ?? line.match(plain);
		if (match === null) {
			continue;
		}
		const indent = match[1] ?? '';
		if (baseIndent === null) {
			baseIndent = indent;
		}
		if (indent !== baseIndent) {
			continue;
		}
		if (taskMatch !== null) {
			const checked = (taskMatch[2] ?? '').toLowerCase() === 'x';
			items.push({
				text: stripMarkdown(taskMatch[3] ?? '').trim(),
				done: checked,
				line: lineNumber,
			});
		} else {
			items.push({
				text: stripMarkdown(match[2] ?? '').trim(),
				done: null,
				line: lineNumber,
			});
		}
	}

	return items.length > 0 ? { type: 'list', items } : null;
}

export function removeSelectionEntries(
	text: string,
	selection: Selection,
	removedLines: Set<number>,
): string {
	if (removedLines.size === 0) {
		return text;
	}

	const lines = text.split(/\r?\n/);
	if (selection.type === 'table') {
		if (selection.rowLines.every((line) => removedLines.has(line))) {
			return '';
		}
		return lines.filter((_line, index) => !removedLines.has(index)).join('\n');
	}

	if (selection.items.every((item) => removedLines.has(item.line))) {
		return '';
	}

	const itemLines = new Set(selection.items.map((item) => item.line));
	let removeGroup = false;
	return lines
		.filter((_line, index) => {
			if (itemLines.has(index)) {
				removeGroup = removedLines.has(index);
			}
			return !removeGroup;
		})
		.join('\n');
}

export function isTaskList(selection: Selection): boolean {
	return (
		selection.type === 'list' &&
		selection.items.length > 0 &&
		selection.items.every((item) => item.done !== null)
	);
}

function stripMarkdown(text: string): string {
	return text
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/`{1,3}[^`]*`/g, '')
		.replace(/\*\*|__|\*|_|~/g, '');
}
