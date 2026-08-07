import { App, DropdownComponent, Modal, Setting, TextComponent } from 'obsidian';
import { BasifyOptions, ConflictMode } from './convert';

export interface BasifyPrompt {
	columns: string[];
	hasHeader: boolean;
	isTaskList: boolean;
	defaultFolder: string;
	defaultBaseFolder: string;
	initial?: Partial<BasifyOptions>;
}

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
	private readonly initial: Partial<BasifyOptions>;
	private readonly resolve: (options: BasifyOptions | null) => void;
	private folderText!: TextComponent;
	private nameColumn = 0;
	private mode: 'file' | 'codeblock' | 'none';
	private statusField: string;
	private baseFolder: string;
	private embedBase: boolean;
	private extractTags: boolean;
	private extractDates: boolean;
	private extractDynamic: boolean;
	private nameSeparator: 'space' | 'dash' | 'underscore';
	private fileNameField: string;
	private fileNameFieldSeparator: 'space' | 'dash' | 'underscore';
	private lowercaseNames: boolean;
	private lowercaseNameField: boolean;
	private lowercaseYamlFields: boolean;
	private sourceMode: 'keep' | 'converted' | 'all';
	private conflictMode: ConflictMode;
	private conflictSuffix: string;
	private fieldsContainer: HTMLElement | null = null;
	private nameFieldOptionsContainer: HTMLElement | null = null;
	private modeOptionsContainer: HTMLElement | null = null;
	private conflictOptionsContainer: HTMLElement | null = null;
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
		this.baseFolder = prompt.defaultBaseFolder;
		this.mode = prompt.initial?.mode ?? 'file';
		this.statusField = prompt.initial?.statusField ?? 'status';
		this.embedBase = prompt.initial?.embedBase ?? false;
		this.extractTags = prompt.initial?.extractTags ?? true;
		this.extractDates = prompt.initial?.extractDates ?? true;
		this.extractDynamic = prompt.initial?.extractDynamic ?? false;
		this.nameSeparator = prompt.initial?.nameSeparator ?? 'space';
		this.fileNameField = prompt.initial?.fileNameField ?? '';
		this.fileNameFieldSeparator =
			prompt.initial?.fileNameFieldSeparator ?? 'space';
		this.lowercaseNames = prompt.initial?.lowercaseNames ?? false;
		this.lowercaseNameField = prompt.initial?.lowercaseNameField ?? false;
		this.lowercaseYamlFields = prompt.initial?.lowercaseYamlFields ?? false;
		this.sourceMode = prompt.initial?.sourceMode ?? 'converted';
		this.conflictMode = prompt.initial?.conflictMode ?? 'skip';
		this.conflictSuffix = prompt.initial?.conflictSuffix ?? 'copy';
		this.initial = prompt.initial ?? {};
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
			});

		new Setting(this.contentEl)
			.setName('Spaces in names')
			.setDesc('Separator used in the note file names.')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption('space', 'Keep spaces')
					.addOption('dash', 'Replace with dashes')
					.addOption('underscore', 'Replace with underscores');
				dropdown.setValue(this.nameSeparator);
				dropdown.onChange((value: string) => {
					this.nameSeparator =
						value === 'dash' || value === 'underscore'
							? value
							: 'space';
				});
			});

		new Setting(this.contentEl)
			.setName('Lowercase file names')
			.setDesc('Use lowercase letters in the note file names.')
			.addToggle((toggle) => {
				toggle.setValue(this.lowercaseNames);
				toggle.onChange((value: boolean) => {
					this.lowercaseNames = value;
				});
			});

		new Setting(this.contentEl)
			.setName('Lowercase property names')
			.setDesc('Use lowercase letters in the frontmatter property names.')
			.addToggle((toggle) => {
				toggle.setValue(this.lowercaseYamlFields);
				toggle.onChange((value: boolean) => {
					this.lowercaseYamlFields = value;
				});
			});

		new Setting(this.contentEl)
			.setName('File name field')
			.setDesc('Write the note name to this property (leave empty to skip).')
			.addText((text) => {
				text
					.setPlaceholder('Title')
					.setValue(this.fileNameField);
				text.onChange((value: string) => {
					this.fileNameField = value.trim();
					this.renderNameFieldOptions();
				});
			});

		this.nameFieldOptionsContainer = this.contentEl.createDiv({
			cls: 'basify-name-field-options',
		});
		this.renderNameFieldOptions();

		if (this.columns.length === 0) {
			new Setting(this.contentEl)
				.setName('Extract tags')
				.setDesc('Turn #tags into a tags field.')
				.addToggle((toggle) => {
					toggle.setValue(this.extractTags);
					toggle.onChange((value: boolean) => {
						this.extractTags = value;
					});
				});
			new Setting(this.contentEl)
				.setName('Extract dates')
				.setDesc('Turn labeled dates into date fields.')
				.addToggle((toggle) => {
					toggle.setValue(this.extractDates);
					toggle.onChange((value: boolean) => {
						this.extractDates = value;
					});
				});
			new Setting(this.contentEl)
				.setName('Dynamic field extraction')
				.setDesc('Turn every key:value pair into a field.')
				.addToggle((toggle) => {
					toggle.setValue(this.extractDynamic);
					toggle.onChange((value: boolean) => {
						this.extractDynamic = value;
					});
				});
		}

		if (this.isTaskList) {
			new Setting(this.contentEl)
				.setName('Status field')
				.setDesc('Property name for the checkbox state.')
				.addText((text) => {
					text.setValue(this.statusField);
					text.onChange((value: string) => {
						this.statusField = value.trim();
					});
				});
		}

		if (this.columns.length > 0) {
			const lastColumn = Math.max(0, this.columns.length - 1);
			this.nameColumn = Math.min(
				Math.max(this.initial.nameColumn ?? 0, 0),
				lastColumn,
			);
			new Setting(this.contentEl)
				.setName('Filename column')
				.setDesc('Column used for the note file names.')
				.addDropdown((dropdown: DropdownComponent) => {
					this.columns.forEach((column, index) => {
						dropdown.addOption(String(index), column);
					});
					dropdown.setValue(String(this.nameColumn));
					dropdown.onChange((value: string) => {
						this.nameColumn = parseInt(value, 10);
						if (!this.hasHeader) {
							this.renderFields();
						}
					});
				});
		}

		if (!this.hasHeader && this.columns.length > 1) {
			new Setting(this.contentEl).setName('Field names').setHeading();
			this.fieldsContainer = this.contentEl.createDiv({
				cls: 'basify-fields',
			});
			this.renderFields();
		}

		new Setting(this.contentEl)
			.setName('Create base as')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown.addOption('file', '.base file');
				dropdown.addOption('codeblock', 'Embed in this note');
				dropdown.addOption('none', "Don't create a base");
				dropdown.setValue(this.mode);
				dropdown.onChange((value: string) => {
					this.mode =
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
				dropdown.setValue(this.sourceMode);
				dropdown.onChange((value: string) => {
					this.sourceMode =
						value === 'keep' || value === 'all' ? value : 'converted';
				});
			});

		new Setting(this.contentEl)
			.setName('If a note already exists')
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown
					.addOption('skip', 'Skip')
					.addOption('suffix', 'Create with suffix')
					.addOption('merge-new', 'Merge, prefer new properties')
					.addOption('merge-old', 'Merge, prefer existing properties');
				dropdown.setValue(this.conflictMode);
				dropdown.onChange((value: string) => {
					this.conflictMode = isConflictMode(value) ? value : 'skip';
					this.renderConflictOptions();
				});
			});

		this.conflictOptionsContainer = this.contentEl.createDiv({
			cls: 'basify-conflict-options',
		});
		this.renderConflictOptions();

		const footer = this.contentEl.createDiv({ cls: 'basify-footer' });
		footer
			.createEl('button', {
				cls: 'mod-cta',
				text: 'Convert',
				attr: { type: 'button' },
			})
			.addEventListener('click', () => this.submit());
	}

	private renderNameFieldOptions(): void {
		const container = this.nameFieldOptionsContainer;
		if (container === null) {
			return;
		}
		container.empty();
		if (this.fileNameField === '') {
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
				dropdown.setValue(this.fileNameFieldSeparator);
				dropdown.onChange((value: string) => {
					this.fileNameFieldSeparator =
						value === 'dash' || value === 'underscore'
							? value
							: 'space';
				});
			});
		new Setting(container)
			.setName('Lowercase name field')
			.setDesc('Use lowercase letters in the property value.')
			.addToggle((toggle) => {
				toggle.setValue(this.lowercaseNameField);
				toggle.onChange((value: boolean) => {
					this.lowercaseNameField = value;
				});
			});
	}

	private renderModeOptions(): void {
		const container = this.modeOptionsContainer;
		if (container === null) {
			return;
		}
		container.empty();
		if (this.mode !== 'file') {
			return;
		}
		new Setting(container)
			.setName('Base files folder')
			.setDesc('Folder where the .base file is created.')
			.addText((text) => {
				text.setValue(this.baseFolder);
				text.onChange((value: string) => {
					this.baseFolder = value.trim();
				});
			});
		new Setting(container)
			.setName('Embed base file in this note')
			.setDesc('Insert a link to the base file at the selection.')
			.addToggle((toggle) => {
				toggle.setValue(this.embedBase);
				toggle.onChange((value: boolean) => {
					this.embedBase = value;
				});
			});
	}

	private renderConflictOptions(): void {
		const container = this.conflictOptionsContainer;
		if (container === null) {
			return;
		}
		container.empty();
		if (this.conflictMode !== 'suffix') {
			return;
		}
		new Setting(container)
			.setName('Conflict suffix')
			.setDesc('Added after the note name. Further conflicts are numbered.')
			.addText((text) => {
				text.setPlaceholder('Copy').setValue(this.conflictSuffix);
				text.onChange((value: string) => {
					this.conflictSuffix = value.trim();
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
			if (index === this.nameColumn) {
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
		this.resolve({
			folder: this.folderText.getValue().trim(),
			baseFolder: this.baseFolder,
			nameColumn:
				this.columns.length > 0 ? this.nameColumn : null,
			mode: this.mode,
			columns: this.columns,
			statusField: this.statusField,
			embedBase: this.embedBase,
			extractTags: this.extractTags,
			extractDates: this.extractDates,
			extractDynamic: this.extractDynamic,
			nameSeparator: this.nameSeparator,
			fileNameField: this.fileNameField,
			fileNameFieldSeparator: this.fileNameFieldSeparator,
			lowercaseNames: this.lowercaseNames,
			lowercaseNameField: this.lowercaseNameField,
			lowercaseYamlFields: this.lowercaseYamlFields,
			sourceMode: this.sourceMode,
			conflictMode: this.conflictMode,
			conflictSuffix: this.conflictSuffix,
		});
		this.close();
	}
}

function isConflictMode(value: string): value is ConflictMode {
	return ['skip', 'suffix', 'merge-new', 'merge-old'].includes(value);
}
