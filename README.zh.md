# Basify

[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=7C3AED&label=downloads&query=%24%5B%22basify%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://community.obsidian.md/plugins/basify)

[English](README.md)

> **注意**：本中文文档完全由 AI 生成，可能存在错误或遗漏；如有出入，请以[英文 README](README.md) 为准。

将选中的**列表**、**任务列表**或**表格**转换为 [Obsidian base](https://obsidian.md/help/bases)。

每个列表项、复选框或表格行都会成为一篇带有 frontmatter yaml 的独立笔记。Basify 可以创建把这些笔记以表格形式展示的 base，也可以只创建可用于 base 的笔记。

如果你觉得 Basify 有用，欢迎在 [github](https://github.com/leolaurindo/basify) 上点个 ⭐。

## 使用方法

1. 在编辑器中**选中**一个列表、任务列表或表格（或将光标置于其中）。
2. 运行命令 **Convert selection to base**。
3. 在对话框中按需调整，然后点击 **Convert**。
4. Basify 会提取 frontmatter yaml 字段，并为每一项创建或更新一篇笔记，随后可选地以文件或内联代码块的形式创建 base。

你的选择会被记住，并在下次自动预填。
尽管解析器和对话框会帮助规范化文件名、字段名和日期，
我仍建议将 Basify 与 [Linter](https://github.com/platers/obsidian-linter) 搭配使用。

## 示例

### 列表

每一项都会成为一篇以它命名的笔记。

```
- 艾伦·图灵
- 格蕾丝·霍珀
```

变为 `艾伦·图灵.md` 和 `格蕾丝·霍珀.md`。`.base` 文件以输出文件夹命名（例如输出文件夹为 `人物` 时生成 `人物.base`）。

### 任务列表

复选框列表会变成带有布尔属性（表示复选框状态）的笔记（`[x]` → `true`，`[ ]` → `false`）。

```
- [x] 买鸡蛋 type: 食材
- [ ] 交水电费 due:2026-08-04
```

变为 `买鸡蛋.md`（含 `status: true` 和 `type: 食材`）和 `交水电费.md`（含 `status: false` 和 `due: 2026-08-04`），而 base 会显示一个可勾选的 **status** 列。

提取出的元数据会从笔记文件名中移除。

### 表格

其中一列会成为笔记文件名（可自行选择），其余每一列都会成为一个 frontmatter 属性。

| 书名 | 作者 | 年份 |
| --- | --- | --- |
| 腹地 | 欧克里德斯·达·库尼亚 | 1902 |
| 第三等级是什么？ | 西哀士 | 1788 |
| 黑色雅各宾派 | C. L. R. 詹姆斯 | 1938 |
| 约翰·柯川：他的一生与音乐 | 刘易斯·波特 | 1998 |

每篇笔记都以所选列命名，并带有 `作者` 和 `年份` 属性，同时生成一个复现该表格的 base。

若书名含有空格（例如拉丁文标题），`Spaces in names` 会决定将空格替换为连字符还是下划线，`Lowercase file names` 则会将拉丁字母转为小写：

```
Rebellion in the Backlands.md
rebellion-in-the-backlands.md   # 空格转连字符并开启小写
The_Black_Jacobins.md           # 空格转下划线
John-Coltrane-His-Life-and-Music.md  # 空格转连字符
```

由于中文标题通常不含空格，这些选项对纯中文文件名没有影响。

尽管 Obsidian 的 Markdown 不把没有表头行的表格识别为表格，它们同样受支持——列名会依次为 `Column 1`、`Column 2`……你可以通过对话框中的 **field names** 选项重命名它们。

## 配置项

对话框中可配置的全部内容：

### 文件夹

- **Output folder** — 笔记创建的位置。
- **Base files folder** — `.base` 文件创建的位置。

### 笔记名称

- **Spaces in names** — 笔记文件名中使用的分隔符：保留空格，或替换为连字符或下划线。这可根据你的文件系统偏好调整；base 对它们都兼容。
- **File name field** — 可选属性，同时用于存储笔记名称（例如 `title`），拥有独立的 **spaces in name field** 分隔符和 **lowercase name field** 选项，与文件名互不影响。
- **Lowercase file names** - 在笔记文件名中使用小写字母（若设置了 file name field，它保留原始大小写）


### 列表（含任务列表）

- **Extract tags** — `#tag`（以及嵌套的 `#tag/sub`）会成为一个 `tags` 列表属性。
- **Extract dates** — 带标签的日期如 `due:2025-01-01`、`start:2026-08-01` 或 `@2023-04-05` 会成为以标签命名的字段（`due`、`start`、`date`……）。未列出的标签（例如 `meeting:2026-01-01`）会回退到 `date` 字段——仅第一个；多余的会保留在名称中。
- **Dynamic field extraction** — 每个 `key:value` 对都会成为一个字段（因此 `type: task` → 一个 `type` 字段）；含有 `key:` 文本的多词值请用引号括起，例如 `title: "Research: a guide"`。它优先于标签和日期选项：开启时，标签和日期也会被提取。

- **Lowercase property names** — 在 frontmatter 属性名中使用小写字母（例如 `Publication Year` → `publication_year`）。

#### 动态字段值

使用方括号表示显式列表：`authors: [Ada, Bob]`。引号括起的项内部的逗号会被保留，例如 `authors: [Ada, "Smith, John"]`。不使用方括号时，含有逗号的值会保持为文本；必要时请将整个值加引号，例如 `author: "Smith, John"`。列表中的数字、布尔值和 `YYYY-MM-DD` 日期会使用其原生 frontmatter 形式。

### 任务列表

- **Status field** — 复选框状态的属性名（默认 `status`）。

### 表格

- **Filename column** — 哪一列成为笔记文件名。
- **Field names** — 对于无表头的表格，为每一列的属性命名（默认 `Column 1`、`Column 2`……）。

### Bases

- **Create base as** — 创建 `.base` 文件、**Embed in this note**，或 **Don't create a base** 只创建可用于 base 的笔记。
- **Embed base file in this note** — 在 `.base` 文件模式下，同时将 base 文件的链接插入当前笔记。

### 源条目

- **Keep all entries** — 保留原始列表或表格，并在其下方追加一个内联 base 或嵌入的 base 链接。
- **Remove converted entries** — 移除已创建或已合并的条目，同时保留被跳过的冲突项。这是默认选项。
- **Remove all entries** — 移除所有选中的条目，包括被跳过的冲突项。

### 已存在的笔记

- **Skip** — 保持已存在的笔记不变。
- **Create with suffix** — 将你的后缀添加到文件名。进一步的冲突会编号（`File copy.md`、`File copy 2.md`……）。
- **Merge, prefer new properties** — 保留已存在笔记的正文，并用转换后的值替换冲突的 frontmatter 属性。
- **Merge, prefer existing properties** — 保留已存在的 frontmatter 值，仅添加缺失的属性。

合并选项将每个属性视为一个整体值。列表及其他属性值会整体替换或保留，而不会合并。

## 字段转换

属性名会被规范化为可在 base 中使用的形式：空格和连字符变为下划线（例如 `Publication Year` 变为 `Publication_Year`），并可选择转为小写（`publication_year`）。中文等非拉丁字符会被保留（例如 `出版年份` 仍为 `出版年份`）。

值以最小的解析量进行转换，因此 Obsidian 能保留有用的类型：

- 数字（例如 `1867`）保持为数字。
- 单词 `true` 和 `false` 会变为布尔值；复选框列表始终生成布尔值 `status`。
- 日期使用 Obsidian 的 `YYYY-MM-DD` 格式，列表每行一项，普通文本保持不加引号。仅当 YAML 语法需要时才为值加引号。

如需更好地清理和规范化生成的 frontmatter，请安装 [Linter](https://github.com/platers/obsidian-linter) 社区插件并在转换后运行它。

## 设置

在 **Settings → Community plugins → Basify** 中，你可以控制对话框预填的文件夹：

- **Default output folder** — 为笔记显示的文件夹。
- **Default base files folder** — 为 `.base` 文件显示的文件夹。

每一项可以是以下之一：

- **Same folder as the active note**（默认）— 从你正在编辑的笔记预填。
- **Last used** — 用你上次转换的文件夹预填。
- **Fixed path** — 用你在设置中输入的路径预填。

对话框始终是唯一事实来源：你在其中设置的内容就是实际使用的内容，并会成为下次的"last used"值。

## 备份你的 vault

Basify 可以创建笔记、将生成的属性合并到已有笔记，并移除已转换的源条目。它不会删除已有的笔记文件。与任何 vault 自动化一样，使用前请**确保已备份你的 vault**。

## 安装
- 最佳安装方式是通过 Obsidian 社区插件市场安装。

或者：
- 将 `main.js`、`manifest.json`、`styles.css` 复制到 `<Vault>/.obsidian/plugins/basify/`。
- 在 **Settings → Community plugins** 中启用插件。

需要 Obsidian **1.13.0+**。

## 开发

```bash
npm install
npm run dev     # 监听模式
npm run build   # 生产构建（tsc + esbuild）
npm run test    # 单元测试（无额外依赖）
npm run lint    # eslint
```

## 发布

发布标签必须与 `manifest.json` 中的版本完全一致，且不带前导 `v`。在 `master` 分支的干净工作区中：

```bash
npm version 0.1.2 -m "Release %s"
git push origin master 0.1.2
```

推送标签会触发发布工作流。它会校验 package 与 manifest 版本，运行测试、lint 和构建，然后创建附带 `main.js`、`manifest.json` 和 `styles.css` 的 GitHub release。
