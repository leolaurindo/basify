import { Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import {
	buildBaseContent,
	buildConvertInput,
	createBaseFile,
	createNotes,
} from './convert';
import {
	getSelectionBlock,
	isTaskList,
	parseSelection,
} from './selection';
import {
	BasifyMemory,
	BasifySettings,
	BasifySettingTab,
	DEFAULT_MEMORY,
	DEFAULT_SETTINGS,
} from './settings';
import { promptBasify } from './ui';

export default class BasifyPlugin extends Plugin {
	settings!: BasifySettings;
	memory!: BasifyMemory;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new BasifySettingTab(this.app, this));

		this.addCommand({
			id: 'convert-selection-to-base',
			name: 'Convert selection to base',
			editorCallback: (editor: Editor) => {
				void this.convertSelection(editor);
			},
		});
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as
			| { settings?: Partial<BasifySettings>; memory?: Partial<BasifyMemory> }
			| null;
		this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
		this.memory = { ...DEFAULT_MEMORY, ...data?.memory };
	}

	async saveSettings(): Promise<void> {
		await this.saveData({ settings: this.settings, memory: this.memory });
	}

	private async convertSelection(editor: Editor): Promise<void> {
		const block = getSelectionBlock(editor);
		const selection = parseSelection(block.text);
		if (selection === null) {
			new Notice('Select a list or a table to convert.');
			return;
		}

		const options = await promptBasify(this.app, {
			columns: selection.type === 'table' ? selection.columns : [],
			hasHeader:
				selection.type === 'table' ? selection.hasHeader : true,
			isTaskList: isTaskList(selection),
			defaultFolder: this.defaultOutputFolder(),
			defaultBaseFolder: this.defaultBaseFolder(),
			initial: {
				nameColumn: this.memory.lastNameColumn,
				statusField: this.memory.lastStatusField,
				mode: this.memory.lastMode,
				embedBase: this.memory.lastEmbedBase,
				extractTags: this.memory.lastExtractTags,
				extractDates: this.memory.lastExtractDates,
				extractDynamic: this.memory.lastExtractDynamic,
				nameSeparator: this.memory.lastNameSeparator,
				fileNameField: this.memory.lastFileNameField,
				fileNameFieldSeparator: this.memory.lastFileNameFieldSeparator,
				lowercaseNames: this.memory.lastLowercaseNames,
				lowercaseNameField: this.memory.lastLowercaseNameField,
				lowercaseYamlFields: this.memory.lastLowercaseYamlFields,
			},
		});
		if (options === null) {
			return;
		}

		this.memory = {
			lastFolder: options.folder,
			lastBaseFolder: options.baseFolder,
			lastNameColumn: options.nameColumn ?? 0,
			lastStatusField: options.statusField,
			lastMode: options.mode,
			lastEmbedBase: options.embedBase,
			lastExtractTags: options.extractTags,
			lastExtractDates: options.extractDates,
			lastExtractDynamic: options.extractDynamic,
			lastNameSeparator: options.nameSeparator,
			lastFileNameField: options.fileNameField,
			lastFileNameFieldSeparator: options.fileNameFieldSeparator,
			lastLowercaseNames: options.lowercaseNames,
			lastLowercaseNameField: options.lowercaseNameField,
			lastLowercaseYamlFields: options.lowercaseYamlFields,
		};
		await this.saveSettings();

		try {
			const input = buildConvertInput(selection, options);
			await createNotes(this.app, input);

			if (options.mode === 'codeblock') {
				editor.setSelection(block.from, block.to);
				editor.replaceSelection(
					`\n\`\`\`base\n${buildBaseContent(input)}\`\`\`\n`,
				);
				new Notice('Created notes and embedded the base in this note.');
			} else {
				const baseFile = await createBaseFile(
					this.app,
					options.baseFolder,
					input.folder,
					buildBaseContent(input),
				);
				if (options.embedBase) {
					editor.setSelection(block.from, block.to);
					editor.replaceSelection(`\n![[${baseFile.name}]]\n`);
					new Notice('Created notes and linked the base in this note.');
				} else {
					await this.app.workspace.getLeaf(true).openFile(baseFile);
					const message =
						input.folder === ''
							? 'Created a base in the vault root.'
							: `Created a base in ${input.folder}.`;
					new Notice(message);
				}
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Basify failed: ${message}`);
		}
	}

	private defaultOutputFolder(): string {
		switch (this.settings.outputFolderMode) {
			case 'fixed':
				return this.settings.fixedOutputFolder.trim() || this.suggestedFolder();
			case 'last':
				return this.memory.lastFolder || this.suggestedFolder();
			default:
				return this.suggestedFolder();
		}
	}

	private defaultBaseFolder(): string {
		switch (this.settings.baseFolderMode) {
			case 'fixed':
				return this.settings.fixedBaseFolder.trim() || this.activeFolder();
			case 'last':
				return this.memory.lastBaseFolder || this.activeFolder();
			default:
				return this.activeFolder();
		}
	}

	private suggestedFolder(): string {
		const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
		if (file === undefined || file === null) {
			return '';
		}
		const parent = file.parent?.path ?? '';
		return parent === '' ? file.basename : `${parent}/${file.basename}`;
	}

	private activeFolder(): string {
		const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
		return file?.parent?.path ?? '';
	}
}
