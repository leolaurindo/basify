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
import {
	BasifyFileMemories,
	loadFileMemories,
	removeFileMemory,
	renameFileMemory,
	saveFileMemory,
} from './memory';
import { promptBasify } from './ui';

export default class BasifyPlugin extends Plugin {
	settings!: BasifySettings;
	memory!: BasifyMemory;
	fileMemories!: BasifyFileMemories;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new BasifySettingTab(this.app, this));
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFile)) {
					return;
				}
				const fileMemories = renameFileMemory(
					this.fileMemories,
					oldPath,
					file.path,
				);
				if (fileMemories !== this.fileMemories) {
					this.fileMemories = fileMemories;
					void this.saveSettings();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (!(file instanceof TFile)) {
					return;
				}
				const fileMemories = removeFileMemory(this.fileMemories, file.path);
				if (fileMemories !== this.fileMemories) {
					this.fileMemories = fileMemories;
					void this.saveSettings();
				}
			}),
		);

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
			| {
					settings?: Partial<BasifySettings>;
					memory?: Partial<BasifyMemory>;
					fileMemories?: unknown;
			  }
			| null;
		this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
		this.memory = { ...DEFAULT_MEMORY, ...data?.memory };
		this.fileMemories = loadFileMemories(data?.fileMemories);
	}

	async saveSettings(): Promise<void> {
		await this.saveData({
			settings: this.settings,
			memory: this.memory,
			fileMemories: this.fileMemories,
		});
	}

	private async convertSelection(editor: Editor): Promise<void> {
		const block = getSelectionBlock(editor);
		const selection = parseSelection(block.text);
		if (selection === null) {
			new Notice('Select a list or a table to convert.');
			return;
		}

		const sourceFile = this.activeFile();
		const fileMemory =
			sourceFile === null ? undefined : this.fileMemories[sourceFile.path];
		const memory = fileMemory ?? this.memory;
		const options = await promptBasify(this.app, {
			columns: selection.type === 'table' ? selection.columns : [],
			hasHeader:
				selection.type === 'table' ? selection.hasHeader : true,
			isTaskList: isTaskList(selection),
			defaultFolder: this.defaultOutputFolder(fileMemory),
			defaultBaseFolder: this.defaultBaseFolder(fileMemory),
			initialColumns: memory.lastColumns,
			initial: {
				nameColumn: memory.lastNameColumn,
				statusField: memory.lastStatusField,
				mode: memory.lastMode,
				embedBase: memory.lastEmbedBase,
				extractTags: memory.lastExtractTags,
				extractDates: memory.lastExtractDates,
				extractDynamic: memory.lastExtractDynamic,
				nameSeparator: memory.lastNameSeparator,
				fileNameField: memory.lastFileNameField,
				fileNameFieldSeparator: memory.lastFileNameFieldSeparator,
				lowercaseNames: memory.lastLowercaseNames,
				lowercaseNameField: memory.lastLowercaseNameField,
				lowercaseYamlFields: memory.lastLowercaseYamlFields,
				sourceMode: memory.lastSourceMode,
				conflictMode: memory.lastConflictMode,
				conflictSuffix: memory.lastConflictSuffix,
				repeatedFieldMode: memory.lastRepeatedFieldMode,
				longFilenameMode: memory.lastLongFilenameMode,
				maxFilenameLength: memory.lastMaxFilenameLength,
				advancedOptions: memory.lastAdvancedOptions,
			},
		});
		if (options === null) {
			return;
		}

		this.memory = {
			lastFolder: options.folder,
			lastBaseFolder: options.baseFolder,
			lastColumns: options.columns,
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
		if (sourceFile !== null) {
			this.fileMemories = saveFileMemory(
				this.fileMemories,
				sourceFile.path,
				this.memory,
			);
		}
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

	private defaultOutputFolder(fileMemory?: BasifyMemory): string {
		if (fileMemory !== undefined) {
			return fileMemory.lastFolder;
		}
		switch (this.settings.outputFolderMode) {
			case 'fixed':
				return this.settings.fixedOutputFolder.trim() || this.suggestedFolder();
			case 'last':
				return this.memory.lastFolder || this.suggestedFolder();
			default:
				return this.suggestedFolder();
		}
	}

	private defaultBaseFolder(fileMemory?: BasifyMemory): string {
		if (fileMemory !== undefined) {
			return fileMemory.lastBaseFolder;
		}
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
		const file = this.activeFile();
		if (file === null) {
			return '';
		}
		const parent = file.parent?.path ?? '';
		return parent === '' ? file.basename : `${parent}/${file.basename}`;
	}

	private activeFolder(): string {
		const file = this.activeFile();
		return file?.parent?.path ?? '';
	}

	private activeFile(): TFile | null {
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
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
