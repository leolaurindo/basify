import { Editor } from 'obsidian';

export type Selection = TableSelection | ListSelection;

export interface TableSelection {
	type: 'table';
	columns: string[];
	rows: Record<string, string>[];
}

export interface ListSelection {
	type: 'list';
	items: string[];
}

const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s/;

export function getSelectionBlock(editor: Editor): string {
	const selection = editor.getSelection();
	if (selection.trim() !== '') {
		return selection;
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

	return editor.getRange(
		{ line: start, ch: 0 },
		{ line: end, ch: editor.getLine(end).length },
	);
}

function isBlockLine(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith('|') || LIST_MARKER.test(trimmed);
}

export function parseSelection(text: string): Selection | null {
	const lines = text.split(/\r?\n/);
	const tableLines = lines.filter((line) => /^\s*\|/.test(line));
	if (tableLines.length >= 2) {
		return parseTable(tableLines);
	}
	return parseList(lines);
}

function parseTable(lines: string[]): TableSelection | null {
	const columns = parseRow(lines[0] ?? '');
	if (columns.length === 0) {
		return null;
	}

	const rows: Record<string, string>[] = [];
	for (const line of lines.slice(2)) {
		const cells = parseRow(line);
		if (cells.length === 0) {
			continue;
		}
		const row: Record<string, string> = {};
		columns.forEach((column, index) => {
			row[column] = cells[index] ?? '';
		});
		rows.push(row);
	}

	return { type: 'table', columns, rows };
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
	const marker = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
	let baseIndent: string | null = null;
	const items: string[] = [];

	for (const line of lines) {
		const match = line.match(marker);
		if (match === null) {
			continue;
		}
		const indent = match[1] ?? '';
		if (baseIndent === null) {
			baseIndent = indent;
		}
		if (indent === baseIndent) {
			items.push(stripMarkdown(match[2] ?? '').trim());
		}
	}

	return items.length > 0 ? { type: 'list', items } : null;
}

function stripMarkdown(text: string): string {
	return text
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/`{1,3}[^`]*`/g, '')
		.replace(/\*\*|__|\*|_|~/g, '');
}
