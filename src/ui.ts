import { App, DropdownComponent, Modal, Setting, TextComponent } from 'obsidian';
import {
	BasifyOptions,
	ConflictModeValue,
	DEFAULT_MAX_FILENAME_LENGTH,
	LongFilenameMode,
	RepeatedFieldMode,
} from './convert';
import { FolderSuggest } from './folder-suggest';

export interface BasifyPrompt {
	columns: string[];
	hasHeader: boolean;
	isTaskList: boolean;
	defaultFolder: string;
	defaultBaseFolder: string;
	initial?: Partial<BasifyOptions>;
}

type ModalOptions = Required<
	Omit<BasifyOptions, 'folder' | 'columns' | 'nameColumn'>
> & { nameColumn: number };

export function promptBasify(
	app: App,
	prompt: BasifyPrompt,
): Promise<BasifyOptions | null> {
	return new Promise((resolve) => {
		const modal = new BasifyModal(app, prompt, resolve);
		modal.open();
	});
}

class BasifyModal extends Modal {
	private readonly columns: string[];
	private readonly hasHeader: boolean;
	private readonly isTaskList: boolean;
	private readonly defaultFolder: string;
	private readonly resolve: (options: BasifyOptions | null) => void;
	private folderText!: TextComponent;
	private outputFolderSuggest: FolderSuggest | null = null;
	private baseFolderSuggest: FolderSuggest | null = null;
	private readonly options: ModalOptions;
	private fieldsContainer: HTMLElement | null = null;
	private nameFieldOptionsContainer: HTMLElement | null = null;
	private modeOptionsContainer: HTMLElement | null = null;
	private conflictOptionsContainer: HTMLElement | null = null;
	private advancedOptionsContainer: HTMLElement | null = null;
	private settled = false;

	constructor(
		app: App,
		prompt: BasifyPrompt,
		resolve: (options: BasifyOptions | null) => void,
	) {
		super(app);
		this.columns = prompt.columns;
		this.hasHeader = prompt.hasHeader;
		this.isTaskList = prompt.isTaskList;
		this.defaultFolder = prompt.defaultFolder;
		this.options = {
			baseFolder: prompt.defaultBaseFolder,
			mode: prompt.initial?.mode ?? 'file',
			statusField: prompt.initial?.statusField ?? 'status',
			embedBase: prompt.initial?.embedBase ?? false,
			extractTags: prompt.initial?.extractTags ?? true,
			extractDates: prompt.initial?.extractDates ?? true,
			extractDynamic: prompt.initial?.extractDynamic ?? false,
			nameSeparator: prompt.initial?.nameSeparator ?? 'space',
			fileNameField: prompt.initial?.fileNameField ?? '',
			fileNameFieldSeparator: prompt.initial?.fileNameFieldSeparator ?? 'space',
			lowercaseNames: prompt.initial?.lowercaseNames ?? false,
			lowercaseNameField: prompt.initial?.lowercaseNameField ?? false,
			lowercaseYamlFields: prompt.initial?.lowercaseYamlFields ?? false,
			sourceMode: prompt.initial?.sourceMode ?? 'converted',
			conflictMode: prompt.initial?.conflictMode ?? 'skip',
			conflictSuffix: prompt.initial?.conflictSuffix ?? 'copy',
			repeatedFieldMode: prompt.initial?.repeatedFieldMode ?? 'list',
			longFilenameMode: prompt.initial?.longFilenameMode ?? 'shorten',
			maxFilenameLength:
				prompt.initial?.maxFilenameLength ?? DEFAULT_MAX_FILENAME_LENGTH,
			advancedOptions: prompt.initial?.advancedOptions ?? false,
			nameColumn: 0,
		};
		if (this.columns.length > 0) {
			const lastColumn = this.columns.length - 1;
			this.options.nameColumn = Math.min(
				Math.max(prompt.initial?.nameColumn ?? 0, 0),
				lastColumn,
			);
		}
		this.resolve = resolve;
	}

	onOpen(): void {
		this.titleEl.setText('Convert to base');

		this.contentEl.createDiv({
			cls: 'basify-warning',
			text: 'Make sure you have a backup of your vault before continuing.',
		});

		new Setting(this.contentEl)
			.setName('Output folder')
			.setDesc('Folder where the notes will be created.')
			.addText((text) => {
				this.folderText = text;
				text
					.setPlaceholder('Folder/name')
					.setValue(this.defaultFolder);
				this.outputFolderSuggest = new FolderSuggest(
					this.app,
					text.inputEl,
				);
			});

		new Setting(this.contentEl)
			.setName('Create base as')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown.addOption('file', '.base file');
				dropdown.addOption('codeblock', 'Embed in this note');
				dropdown.addOption('none', "Don't create a base");
				dropdown.setValue(this.options.mode);
				dropdown.onChange((value: string) => {
					this.options.mode =
						value === 'codeblock' || value === 'none' ? value : 'file';
					this.renderModeOptions();
				});
			});

		this.modeOptionsContainer = this.contentEl.createDiv({
			cls: 'basify-mode-options',
		});
		this.renderModeOptions();

		new Setting(this.contentEl)
			.setName('Source entries')
			.setDesc(
				'Remove converted keeps skipped conflicts; remove all also removes them.',
			)
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption('keep', 'Keep all entries')
					.addOption('converted', 'Remove converted entries')
					.addOption('all', 'Remove all entries');
				dropdown.setValue(this.options.sourceMode);
				dropdown.onChange((value: string) => {
					this.options.sourceMode =
						value === 'keep' || value === 'all' ? value : 'converted';
				});
			});

		new Setting(this.contentEl)
			.setName('If a note already exists')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption('skip', 'Skip')
					.addOption('suffix', 'Create with suffix')
					.addOption('hash', 'Create with hash suffix')
					.addOption('merge-new', 'Merge, prefer new properties')
					.addOption('merge-old', 'Merge, prefer existing properties')
					.addOption('merge-combine', 'Merge, combine conflicting properties');
				dropdown.setValue(this.options.conflictMode);
				dropdown.onChange((value: string) => {
					this.options.conflictMode = isConflictMode(value) ? value : 'skip';
					this.renderConflictOptions();
				});
			});

		this.conflictOptionsContainer = this.contentEl.createDiv({
			cls: 'basify-conflict-options',
		});
		this.renderConflictOptions();

		new Setting(this.contentEl)
			.setName('Advanced options')
			.setDesc('Show formatting, extraction, and filename details.')
			.addToggle((toggle) => {
				toggle.setValue(this.options.advancedOptions);
				toggle.onChange((value: boolean) => {
					this.options.advancedOptions = value;
					this.renderAdvancedOptions();
				});
			});

		this.advancedOptionsContainer = this.contentEl.createDiv({
			cls: 'basify-advanced-options',
		});
		this.renderAdvancedOptions();

		const footer = this.contentEl.createDiv({ cls: 'basify-footer' });
		footer
			.createEl('button', {
				cls: 'mod-cta',
				text: 'Convert',
				attr: { type: 'button' },
			})
			.addEventListener('click', () => this.submit());
	}

	private renderAdvancedOptions(): void {
		const container = this.advancedOptionsContainer;
		if (container === null) {
			return;
		}
		container.empty();
		this.fieldsContainer = null;
		this.nameFieldOptionsContainer = null;
		if (!this.options.advancedOptions) {
			return;
		}

		new Setting(container)
			.setName('Spaces in names')
			.setDesc('Separator used in the note file names.')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption('space', 'Keep spaces')
					.addOption('dash', 'Replace with dashes')
					.addOption('underscore', 'Replace with underscores');
				dropdown.setValue(this.options.nameSeparator);
				dropdown.onChange((value: string) => {
					this.options.nameSeparator =
						value === 'dash' || value === 'underscore' ? value : 'space';
				});
			});

		new Setting(container)
			.setName('Lowercase file names')
			.setDesc('Use lowercase letters in the note file names.')
			.addToggle((toggle) => {
				toggle.setValue(this.options.lowercaseNames);
				toggle.onChange((value: boolean) => {
					this.options.lowercaseNames = value;
				});
			});

		new Setting(container)
			.setName('Lowercase property names')
			.setDesc('Use lowercase letters in the frontmatter property names.')
			.addToggle((toggle) => {
				toggle.setValue(this.options.lowercaseYamlFields);
				toggle.onChange((value: boolean) => {
					this.options.lowercaseYamlFields = value;
				});
			});

		new Setting(container)
			.setName('File name field')
			.setDesc('Write the note name to this property (leave empty to skip).')
			.addText((text) => {
				text.setPlaceholder('Title').setValue(this.options.fileNameField);
				text.onChange((value: string) => {
					this.options.fileNameField = value.trim();
					this.renderNameFieldOptions();
				});
			});
		this.nameFieldOptionsContainer = container.createDiv({
			cls: 'basify-name-field-options',
		});
		this.renderNameFieldOptions();

		if (this.columns.length === 0) {
			new Setting(container)
				.setName('Extract tags')
				.setDesc('Turn #tags into a tags field.')
				.addToggle((toggle) => {
					toggle.setValue(this.options.extractTags);
					toggle.onChange((value: boolean) => {
						this.options.extractTags = value;
					});
				});
			new Setting(container)
				.setName('Extract dates')
				.setDesc('Turn labeled dates into date fields.')
				.addToggle((toggle) => {
					toggle.setValue(this.options.extractDates);
					toggle.onChange((value: boolean) => {
						this.options.extractDates = value;
					});
				});
			new Setting(container)
				.setName('Dynamic field extraction')
				.setDesc('Turn every key:value pair into a field.')
				.addToggle((toggle) => {
					toggle.setValue(this.options.extractDynamic);
					toggle.onChange((value: boolean) => {
						this.options.extractDynamic = value;
					});
				});
			new Setting(container)
				.setName('Repeated field values')
				.setDesc('How duplicate dynamic fields are stored.')
				.addDropdown((dropdown: DropdownComponent) => {
					dropdown
						.addOption('list', 'Keep as list')
						.addOption('concatenate', 'Concatenate values')
						.addOption('first', 'Keep first value')
						.addOption('last', 'Keep last value');
					dropdown.setValue(this.options.repeatedFieldMode);
					dropdown.onChange((value: string) => {
						this.options.repeatedFieldMode = isRepeatedFieldMode(value)
							? value
							: 'list';
					});
				});
		}

		if (this.isTaskList) {
			new Setting(container)
				.setName('Status field')
				.setDesc('Property name for the checkbox state.')
				.addText((text) => {
					text.setValue(this.options.statusField);
					text.onChange((value: string) => {
						this.options.statusField = value.trim();
					});
				});
		}

		if (this.columns.length > 0) {
			new Setting(container)
				.setName('Filename column')
				.setDesc('Column used for the note file names.')
				.addDropdown((dropdown: DropdownComponent) => {
					this.columns.forEach((column, index) => {
						dropdown.addOption(String(index), column);
					});
					dropdown.setValue(String(this.options.nameColumn));
					dropdown.onChange((value: string) => {
						this.options.nameColumn = parseInt(value, 10);
						if (!this.hasHeader) {
							this.renderFields();
						}
					});
				});
		}

		if (!this.hasHeader && this.columns.length > 1) {
			new Setting(container).setName('Field names').setHeading();
			this.fieldsContainer = container.createDiv({ cls: 'basify-fields' });
			this.renderFields();
		}

		new Setting(container)
			.setName('Long filenames')
			.setDesc('Choose what to do when a note filename exceeds the limit.')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption('shorten', 'Shorten')
					.addOption('skip', 'Skip entry')
					.addOption('cancel', 'Cancel conversion');
				dropdown.setValue(this.options.longFilenameMode);
				dropdown.onChange((value: string) => {
					this.options.longFilenameMode = isLongFilenameMode(value)
						? value
						: 'shorten';
				});
			});

		new Setting(container)
			.setName('Maximum filename length')
			.setDesc('Maximum length of the note filename, without .md.')
			.addText((text) => {
				text.setValue(String(this.options.maxFilenameLength));
				text.inputEl.type = 'number';
				text.onChange((value: string) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isInteger(parsed) && parsed > 3) {
						this.options.maxFilenameLength = parsed;
					}
				});
			});
	}

	private renderNameFieldOptions(): void {
		const container = this.nameFieldOptionsContainer;
		if (container === null) {
			return;
		}
		container.empty();
		if (this.options.fileNameField === '') {
			return;
		}
		new Setting(container)
			.setName('Spaces in name field')
			.setDesc('Separator used in the property value.')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption('space', 'Keep spaces')
					.addOption('dash', 'Replace with dashes')
					.addOption('underscore', 'Replace with underscores');
				dropdown.setValue(this.options.fileNameFieldSeparator);
				dropdown.onChange((value: string) => {
					this.options.fileNameFieldSeparator =
						value === 'dash' || value === 'underscore'
							? value
							: 'space';
				});
			});
		new Setting(container)
			.setName('Lowercase name field')
			.setDesc('Use lowercase letters in the property value.')
			.addToggle((toggle) => {
				toggle.setValue(this.options.lowercaseNameField);
				toggle.onChange((value: boolean) => {
					this.options.lowercaseNameField = value;
				});
			});
	}

	private renderModeOptions(): void {
		const container = this.modeOptionsContainer;
		if (container === null) {
			return;
		}
		this.baseFolderSuggest?.close();
		this.baseFolderSuggest = null;
		container.empty();
		if (this.options.mode !== 'file') {
			return;
		}
		new Setting(container)
			.setName('Base files folder')
			.setDesc('Folder where the .base file is created.')
			.addText((text) => {
				text.setValue(this.options.baseFolder);
				text.onChange((value: string) => {
					this.options.baseFolder = value.trim();
				});
				this.baseFolderSuggest = new FolderSuggest(
					this.app,
					text.inputEl,
					(path) => {
						this.options.baseFolder = path;
					},
				);
			});
		new Setting(container)
			.setName('Embed base file in this note')
			.setDesc('Insert a link to the base file at the selection.')
			.addToggle((toggle) => {
				toggle.setValue(this.options.embedBase);
				toggle.onChange((value: boolean) => {
					this.options.embedBase = value;
				});
			});
	}

	private renderConflictOptions(): void {
		const container = this.conflictOptionsContainer;
		if (container === null) {
			return;
		}
		container.empty();
		if (this.options.conflictMode !== 'suffix') {
			return;
		}
		new Setting(container)
			.setName('Conflict suffix')
			.setDesc('Added after the note name. Further conflicts are numbered.')
			.addText((text) => {
				text.setPlaceholder('Copy').setValue(this.options.conflictSuffix);
				text.onChange((value: string) => {
					this.options.conflictSuffix = value.trim();
				});
			});
	}

	private renderFields(): void {
		const container = this.fieldsContainer;
		if (container === null) {
			return;
		}
		container.empty();
		this.columns.forEach((column, index) => {
			if (index === this.options.nameColumn) {
				return;
			}
			new Setting(container)
				.setName(`Field ${index + 1}`)
				.setDesc('Property name used in the notes.')
				.addText((text) => {
					text.setValue(column);
					text.onChange((value: string) => {
						this.columns[index] = value.trim();
					});
				});
		});
	}

	onClose(): void {
		this.outputFolderSuggest?.close();
		this.baseFolderSuggest?.close();
		if (!this.settled) {
			this.settled = true;
			this.resolve(null);
		}
		this.contentEl.empty();
	}

	private submit(): void {
		if (this.settled) {
			return;
		}
		this.settled = true;
		const folder = this.folderText.getValue().trim();
		const { baseFolder, nameColumn, mode, ...options } = this.options;
		this.resolve({
			folder,
			baseFolder,
			nameColumn: this.columns.length > 0 ? nameColumn : null,
			mode,
			columns: this.columns,
			...options,
		});
		this.close();
	}
}

function isConflictMode(value: string): value is ConflictModeValue {
	return [
		'skip',
		'suffix',
		'hash',
		'merge-new',
		'merge-old',
		'merge-combine',
	].includes(value);
}

function isRepeatedFieldMode(value: string): value is RepeatedFieldMode {
	return ['list', 'concatenate', 'first', 'last'].includes(value);
}

function isLongFilenameMode(value: string): value is LongFilenameMode {
	return ['shorten', 'skip', 'cancel'].includes(value);
}
