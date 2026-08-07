import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly onChoose?: (path: string) => void,
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const search = query.trim().toLowerCase();
		return [
			this.app.vault.getRoot(),
			...this.app.vault
				.getAllLoadedFiles()
				.filter(
					(file): file is TFolder =>
						file instanceof TFolder && !file.isRoot(),
				),
		]
			.filter((folder) => this.label(folder).toLowerCase().includes(search))
			.sort((a, b) => {
				if (a.isRoot()) return -1;
				if (b.isRoot()) return 1;
				return a.path.localeCompare(b.path);
			});
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(this.label(folder));
	}

	selectSuggestion(folder: TFolder): void {
		const path = folder.isRoot() ? '' : folder.path;
		this.setValue(path);
		this.onChoose?.(path);
		this.close();
	}

	private label(folder: TFolder): string {
		return folder.isRoot() ? 'Vault root' : folder.path;
	}
}
