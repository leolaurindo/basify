const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s/;

/** Markdown tabs advance to the next four-column stop. */
export function indentationWidth(line: string): number {
	const whitespace = line.match(/^[\t ]*/)?.[0] ?? '';
	let width = 0;
	for (const character of whitespace) {
		width += character === '\t' ? 4 - width % 4 : 1;
	}
	return width;
}

function removeIndentation(line: string, width: number): string {
	let column = 0;
	let index = 0;
	while (index < line.length && column < width) {
		const character = line[index];
		if (character !== ' ' && character !== '\t') break;
		column += character === '\t' ? 4 - column % 4 : 1;
		index++;
	}
	return ' '.repeat(Math.max(0, column - width)) + line.slice(index);
}

/** Promote a parent's content to the body, keeping deeper nesting relative. */
export function extractListBody(lines: string[], parentLine: number, end: number): string {
	const parent = lines[parentLine] ?? '';
	const parentIndent = indentationWidth(parent);
	const content: string[] = [];
	for (const line of lines.slice(parentLine + 1, end)) {
		if (line.trim() !== '' && indentationWidth(line) <= parentIndent) break;
		content.push(line);
	}
	const nonempty = content.filter((line) => line.trim() !== '');
	if (nonempty.length === 0) return '';
	const minimumIndent = Math.min(...nonempty.map(indentationWidth));
	const nestedLists = nonempty.filter((line) => LIST_MARKER.test(line));
	const childIndent = nestedLists.length > 0
		? Math.min(...nestedLists.map(indentationWidth))
		: null;
	const marker = parent.match(/^\s*(?:[-*+]|\d+[.)])\s+/)?.[0] ?? '';
	const markerWidth = indentationWidth(marker.replace(/\S/g, ' '));
	// Preserve four-space Markdown code indentation when the body only
	// contains an indented code block, rather than a nested list or prose.
	const indent = childIndent === null && minimumIndent >= markerWidth + 4
		? markerWidth
		: minimumIndent;
	while (content.length > 0 && content[0]?.trim() === '') content.shift();
	while (content.length > 0 && content[content.length - 1]?.trim() === '') content.pop();
	let inChildList = false;
	return content.map((line) => {
		const width = indentationWidth(line);
		if (line.trim() !== '') {
			if (childIndent !== null && LIST_MARKER.test(line) && width === childIndent) inChildList = true;
			else if (childIndent !== null && width < childIndent) inChildList = false;
		}
		return removeIndentation(line, inChildList ? childIndent ?? indent : indent);
	}).join('\n');
}
