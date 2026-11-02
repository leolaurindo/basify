import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import { DEFAULT_BODY_LAYOUT } from './body';
import type BasifyPlugin from './main';

export type FolderMode = 'folder' | 'last' | 'fixed';

export interface BasifySettings {
	outputFolderMode: FolderMode;
	fixedOutputFolder: string;
	baseFolderMode: FolderMode;
	fixedBaseFolder: string;
	bodyLayout: string;
	noteBodyAnnouncementSeen: boolean;
}

export const DEFAULT_SETTINGS: BasifySettings = {
	outputFolderMode: 'folder',
	fixedOutputFolder: '',
	baseFolderMode: 'folder',
	fixedBaseFolder: '',
	bodyLayout: DEFAULT_BODY_LAYOUT,
	noteBodyAnnouncementSeen: false,
};

export { DEFAULT_MEMORY } from './memory';
export type { BasifyMemory } from './memory';

const FOLDER_OPTIONS: Record<string, string> = {
	folder: 'Same folder as the active note',
	last: 'Last used',
	fixed: 'Fixed path',
};

export class BasifySettingTab extends PluginSettingTab {
	plugin: BasifyPlugin;

	constructor(app: App, plugin: BasifyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Note body layout',
				desc: 'Markdown for new notes. Use {{title}} for the readable title, {{body}} for incoming content, and {{source}} for a source-note link. Merges use incoming content only, without the layout. Include {{body}} when copying content.',
				control: { type: 'textarea', key: 'bodyLayout', rows: 8, defaultValue: DEFAULT_BODY_LAYOUT },
			},
			{
				name: 'Default output folder',
				desc: 'Folder prefilled in the dialog for the notes.',
				control: {
					type: 'dropdown',
					key: 'outputFolderMode',
					options: FOLDER_OPTIONS,
					defaultValue: 'folder',
				},
			},
			{
				name: 'Fixed output folder',
				desc: 'Used in fixed path mode.',
				control: {
					type: 'text',
					key: 'fixedOutputFolder',
					placeholder: 'Folder/name',
					defaultValue: '',
				},
				visible: () =>
					this.plugin.settings.outputFolderMode === 'fixed',
			},
			{
				name: 'Default base files folder',
				desc: 'Folder prefilled in the dialog for the .base file.',
				control: {
					type: 'dropdown',
					key: 'baseFolderMode',
					options: FOLDER_OPTIONS,
					defaultValue: 'folder',
				},
			},
			{
				name: 'Fixed base files folder',
				desc: 'Used in fixed path mode.',
				control: {
					type: 'text',
					key: 'fixedBaseFolder',
					placeholder: 'Folder/name',
					defaultValue: '',
				},
				visible: () =>
					this.plugin.settings.baseFolderMode === 'fixed',
			},
		];
	}

	getControlValue(key: string): unknown {
		const settings = this.plugin.settings as unknown as Record<
			string,
			unknown
		>;
		return settings[key];
	}

	setControlValue(key: string, value: unknown): void {
		const settings = this.plugin.settings as unknown as Record<
			string,
			unknown
		>;
		settings[key] = value;
		void this.plugin.saveSettings();
		this.refreshDomState();
	}
}
