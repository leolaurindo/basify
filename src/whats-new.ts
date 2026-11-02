import { App, Modal, Setting } from 'obsidian';

// Keep this tied to the feature release, even when users upgrade much later.
const NOTE_BODY_RELEASE = '0.1.10';

/** A single announcement for the note-body update, not a release notification system. */
export class NoteBodyAnnouncement extends Modal {
	constructor(
		app: App,
		private readonly acknowledge: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Basify: What's new on v${NOTE_BODY_RELEASE}`);
		this.contentEl.createEl('p', { text: 'Table columns can now become note body content instead of properties.' });
		this.contentEl.createEl('p', { text: 'Nested lists and indented paragraphs are now copied into generated notes by default. Previously, they were not copied and could be lost when converted source entries were removed. You can turn this off in the conversion dialog.' });
		this.contentEl.createEl('p', { text: 'When merging existing notes, append at bottom is the recommended default. You can also replace the body or leave it unchanged. Read the inline warnings before removing source entries.' });
		this.contentEl.createEl('p', { text: 'Customize new notes in Settings → Basify using a Markdown body layout with {{title}}, {{body}}, and {{source}}. Your conversion choices are remembered as before.' });
		const chinese = this.contentEl.createEl('details');
		chinese.createEl('summary', { text: '中文' });
		chinese.createEl('p', { text: '表格列现在可以写入笔记正文，而不只是属性。' });
		chinese.createEl('p', { text: '嵌套列表和缩进段落现在默认复制到生成的笔记中。以前这些内容不会被复制，移除已转换的源条目时可能丢失。可在转换对话框中关闭此选项。' });
		chinese.createEl('p', { text: '合并现有笔记时，默认推荐在末尾追加内容，也可替换正文或保持原正文不变。移除源条目前，请阅读行内警告。' });
		chinese.createEl('p', { text: '在 Settings → Basify 中使用 {{title}}、{{body}} 和 {{source}} 自定义新笔记的 Markdown 正文布局。转换选项仍会被记住。' });
		const support = this.contentEl.createEl('p');
		support.appendText('Enjoying Basify? Consider helping fund my Mandarin studies! 喜欢 Basify？欢迎支持我学习普通话！ ');
		support.createEl('a', {
			text: 'Ko-fi',
			href: 'https://ko-fi.com/leolaurindo',
			attr: { target: '_blank', rel: 'noopener noreferrer' },
		});
		support.appendText(' · ');
		support.createEl('a', {
			text: 'Afdian (爱发电)',
			href: 'https://afdian.com/a/leolaurindo',
			attr: { target: '_blank', rel: 'noopener noreferrer' },
		});
		new Setting(this.contentEl).addButton((button) => {
			button.setButtonText('Got it').setCta().onClick(() => this.close());
			button.buttonEl.focus();
		});
	}

	onClose(): void {
		this.acknowledge();
		this.contentEl.empty();
	}
}
