export class Plugin {}

export class App {
	vault!: Vault;
	workspace!: Workspace;
}

export class Vault {}

export class TFolder {}

export class TFile {
	path: string;
	name: string;
	basename: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() ?? '';
		this.basename = this.name.replace(/\.[^.]+$/, '');
	}
}

export class Workspace {
	getActiveViewOfType(): null {
		return null;
	}

	getLeaf(): WorkspaceLeaf {
		return new WorkspaceLeaf();
	}
}

export class WorkspaceLeaf {
	async openFile(): Promise<void> {}
}

export class Editor {}

export interface EditorPosition {
	line: number;
	ch: number;
}

export class Notice {
	constructor(_message: string, _duration?: number) {}
}
