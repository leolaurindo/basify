import { Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import { buildConvertInput, convertToBase } from './convert';
import { getSelectionBlock, parseSelection } from './selection';
import { promptBasify } from './ui';

export default class BasifyPlugin extends Plugin {
	async onload(): Promise<void> {
		this.addCommand({
			id: 'convert-selection-to-base',
			name: 'Convert selection to base',
			editorCallback: (editor: Editor) => {
				void this.convertSelection(editor);
			},
		});
	}

	private async convertSelection(editor: Editor): Promise<void> {
		const selection = parseSelection(getSelectionBlock(editor));
		if (selection === null) {
			new Notice('Select a list or a table to convert.');
			return;
		}

		const columns =
			selection.type === 'table' ? selection.columns : [];
		const options = await promptBasify(
			this.app,
			columns,
			this.defaultFolder(),
		);
		if (options === null) {
			return;
		}

		try {
			await convertToBase(
				this.app,
				buildConvertInput(selection, options),
			);
			const message =
				options.folder === ''
					? 'Created a base in the vault root.'
					: `Created a base in ${options.folder}.`;
			new Notice(message);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Basify failed: ${message}`);
		}
	}

	private defaultFolder(): string {
		const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
		if (file === undefined || file === null) {
			return '';
		}
		const parent = file.parent?.path ?? '';
		return parent === '' ? file.basename : `${parent}/${file.basename}`;
	}
}
