export type ExistingBodyMode = 'append' | 'replace' | 'keep';
export const DEFAULT_BODY_LAYOUT = '{{body}}';

function trimBlankLines(value: string): string {
	return value.replace(/^(?:[\t ]*\r?\n)+|(?:\r?\n[\t ]*)+$/g, '');
}

export function renderBodyLayout(
	layout: string,
	title: string,
	body: string,
	source: string,
): string {
	const values: Record<string, string> = { title, body, source };
	return trimBlankLines(layout.replace(
		/\{\{(title|body|source)\}\}/g,
		(_, key: string) => values[key] ?? '',
	));
}

/** Preserve frontmatter byte-for-byte; only modify the Markdown body. */
export function updateExistingBody(
	content: string,
	incoming: string,
	mode: ExistingBodyMode,
): string {
	if (mode === 'keep' || incoming.trim() === '') return content;
	const frontmatter = content.match(
		/^(?:\uFEFF)?---\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)(?:\r?\n|$)/,
	)?.[0] ?? '';
	const existing = content.slice(frontmatter.length);
	const body = mode === 'replace'
		? trimBlankLines(incoming)
		: [existing.trimEnd(), trimBlankLines(incoming)].filter(Boolean).join('\n\n');
	return `${frontmatter}${frontmatter && !frontmatter.endsWith('\n') ? '\n' : ''}${body}\n`;
}
