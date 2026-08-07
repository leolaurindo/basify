import { Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import {
	buildBaseContent,
	buildConvertInput,
	createBaseFile,
	createNotes,
	LongFilenameError,
} from './convert';
import {
	getSelectionBlock,
	isTaskList,
	parseSelection,
	removeSelectionEntries,
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
				sourceMode: this.memory.lastSourceMode,
				conflictMode: this.memory.lastConflictMode,
				conflictSuffix: this.memory.lastConflictSuffix,
				repeatedFieldMode: this.memory.lastRepeatedFieldMode,
				longFilenameMode: this.memory.lastLongFilenameMode,
				maxFilenameLength: this.memory.lastMaxFilenameLength,
				advancedOptions: this.memory.lastAdvancedOptions,
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
			lastSourceMode: options.sourceMode,
			lastConflictMode: options.conflictMode,
			lastConflictSuffix: options.conflictSuffix,
			lastRepeatedFieldMode: options.repeatedFieldMode ?? 'list',
			lastLongFilenameMode: options.longFilenameMode ?? 'shorten',
			lastMaxFilenameLength: options.maxFilenameLength ?? 120,
			lastAdvancedOptions: options.advancedOptions ?? false,
		};
		await this.saveSettings();

		try {
			const input = buildConvertInput(selection, options);
			const results = await createNotes(
				this.app,
				input,
				options.conflictMode,
				options.conflictSuffix,
				options.longFilenameMode,
				options.maxFilenameLength,
			);
			let generated = '';
			let baseFile: TFile | null = null;

			if (options.mode === 'codeblock') {
				generated = `\`\`\`base\n${buildBaseContent(input)}\`\`\``;
			} else if (options.mode === 'file') {
				baseFile = await createBaseFile(
					this.app,
					options.baseFolder,
					input.folder,
					buildBaseContent(input),
				);
				if (options.embedBase) {
					generated = `![[${baseFile.name}]]`;
				}
			}

			const removedLines = new Set(
				results
					.filter((result) => result.status !== 'skipped')
					.map((result) => result.sourceLine),
			);
			const source =
				options.sourceMode === 'keep'
					? block.text
					: options.sourceMode === 'all'
						? ''
						: removeSelectionEntries(block.text, selection, removedLines);
			if (source !== block.text || generated !== '') {
				editor.setSelection(block.from, block.to);
				editor.replaceSelection(joinSourceAndGenerated(source, generated));
			}

			if (baseFile !== null && !options.embedBase) {
				await this.app.workspace.getLeaf(true).openFile(baseFile);
			}
			const created = results.filter(
				(result) => result.status === 'created',
			).length;
			const merged = results.filter(
				(result) => result.status === 'merged',
			).length;
			const skipped = results.length - created - merged;
			const shortened = results.filter((result) => result.shortened).length;
			new Notice(
				`Basify: ${created} created, ${merged} merged, ${skipped} skipped.${
					shortened > 0 ? ` ${shortened} filenames shortened.` : ''
				}`,
			);
		} catch (error) {
			if (error instanceof LongFilenameError) {
				new Notice(`Basify cancelled: ${error.message}`);
				return;
			}
			console.error('[Basify] conversion-failed', {
				errorType: error instanceof Error ? error.name : 'unknown',
			});
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

function joinSourceAndGenerated(source: string, generated: string): string {
	if (generated === '') {
		return source;
	}
	if (source === '') {
		return `${generated}\n`;
	}
	return `${source}\n\n${generated}\n`;
}
