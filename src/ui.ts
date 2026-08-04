import { App, DropdownComponent, Modal, Setting, TextComponent } from 'obsidian';
import { BasifyOptions } from './convert';

export function promptBasify(
	app: App,
	columns: string[],
	defaultFolder: string,
): Promise<BasifyOptions | null> {
	return new Promise((resolve) => {
		const modal = new BasifyModal(app, columns, defaultFolder, resolve);
		modal.open();
	});
}

class BasifyModal extends Modal {
	private readonly columns: string[];
	private readonly defaultFolder: string;
	private readonly resolve: (options: BasifyOptions | null) => void;
	private folderText!: TextComponent;
	private nameColumn = 0;
	private settled = false;

	constructor(
		app: App,
		columns: string[],
		defaultFolder: string,
		resolve: (options: BasifyOptions | null) => void,
	) {
		super(app);
		this.columns = columns;
		this.defaultFolder = defaultFolder;
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
			.setDesc('Folder where the notes and the base file will be created.')
			.addText((text) => {
				this.folderText = text;
				text
					.setPlaceholder('Folder/name')
					.setValue(this.defaultFolder);
			});

		if (this.columns.length > 0) {
			new Setting(this.contentEl)
				.setName('Filename column')
				.setDesc('Column used for the note file names.')
				.addDropdown((dropdown: DropdownComponent) => {
					this.columns.forEach((column, index) => {
						dropdown.addOption(String(index), column);
					});
					dropdown.setValue('0');
					dropdown.onChange((value: string) => {
						this.nameColumn = parseInt(value, 10);
					});
				});
		}

		const footer = this.contentEl.createDiv({ cls: 'basify-footer' });
		footer
			.createEl('button', {
				cls: 'mod-cta',
				text: 'Convert',
				attr: { type: 'button' },
			})
			.addEventListener('click', () => this.submit());
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
			nameColumn:
				this.columns.length > 0 ? this.nameColumn : null,
		});
		this.close();
	}
}
