import { App, PluginSettingTab, Setting } from 'obsidian';
import type BasifyPlugin from './main';

export type FolderMode = 'folder' | 'last' | 'fixed';

export interface BasifySettings {
	outputFolderMode: FolderMode;
	fixedOutputFolder: string;
	baseFolderMode: FolderMode;
	fixedBaseFolder: string;
}

export const DEFAULT_SETTINGS: BasifySettings = {
	outputFolderMode: 'folder',
	fixedOutputFolder: '',
	baseFolderMode: 'folder',
	fixedBaseFolder: '',
};

export interface BasifyMemory {
	lastFolder: string;
	lastBaseFolder: string;
	lastNameColumn: number;
	lastStatusField: string;
	lastMode: 'file' | 'codeblock';
	lastEmbedBase: boolean;
	lastExtractTags: boolean;
	lastExtractDates: boolean;
	lastExtractDynamic: boolean;
	lastNameSeparator: 'space' | 'dash' | 'underscore';
	lastFileNameField: string;
	lastFileNameFieldSeparator: 'space' | 'dash' | 'underscore';
	lastLowercaseNames: boolean;
	lastLowercaseNameField: boolean;
	lastLowercaseYamlFields: boolean;
}

export const DEFAULT_MEMORY: BasifyMemory = {
	lastFolder: '',
	lastBaseFolder: '',
	lastNameColumn: 0,
	lastStatusField: 'status',
	lastMode: 'file',
	lastEmbedBase: false,
	lastExtractTags: true,
	lastExtractDates: true,
	lastExtractDynamic: false,
	lastNameSeparator: 'space',
	lastFileNameField: '',
	lastFileNameFieldSeparator: 'space',
	lastLowercaseNames: false,
	lastLowercaseNameField: false,
	lastLowercaseYamlFields: false,
};

export class BasifySettingTab extends PluginSettingTab {
	plugin: BasifyPlugin;

	constructor(app: App, plugin: BasifyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Default output folder')
			.setDesc('Folder prefilled in the dialog for the notes.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('folder', 'Same folder as the active note')
					.addOption('last', 'Last used')
					.addOption('fixed', 'Fixed path');
				dropdown.setValue(this.plugin.settings.outputFolderMode);
				dropdown.onChange(async (value: string) => {
					this.plugin.settings.outputFolderMode = value as FolderMode;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (this.plugin.settings.outputFolderMode === 'fixed') {
			new Setting(containerEl)
				.setName('Fixed output folder')
				.setDesc('Used in fixed path mode.')
				.addText((text) => {
					text
						.setPlaceholder('Folder/name')
						.setValue(this.plugin.settings.fixedOutputFolder);
					text.onChange(async (value: string) => {
						this.plugin.settings.fixedOutputFolder = value;
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName('Default base files folder')
			.setDesc('Folder prefilled in the dialog for the .base file.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('folder', 'Same folder as the active note')
					.addOption('last', 'Last used')
					.addOption('fixed', 'Fixed path');
				dropdown.setValue(this.plugin.settings.baseFolderMode);
				dropdown.onChange(async (value: string) => {
					this.plugin.settings.baseFolderMode = value as FolderMode;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (this.plugin.settings.baseFolderMode === 'fixed') {
			new Setting(containerEl)
				.setName('Fixed base folder')
				.setDesc('Used in fixed path mode.')
				.addText((text) => {
					text
						.setPlaceholder('Folder/name')
						.setValue(this.plugin.settings.fixedBaseFolder);
					text.onChange(async (value: string) => {
						this.plugin.settings.fixedBaseFolder = value;
						await this.plugin.saveSettings();
					});
				});
		}
	}
}
