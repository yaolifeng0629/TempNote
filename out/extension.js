"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class TempNoteProvider {
    context;
    _onDidChange = new vscode.EventEmitter();
    onDidChange = this._onDidChange.event;
    tempNotes = new Map();
    noteCounter = 1;
    constructor(context) {
        this.context = context;
    }
    provideTextDocumentContent(uri) {
        const noteId = uri.path.substring(1);
        const note = this.tempNotes.get(noteId);
        return note ? note.content : '';
    }
    createTempNote(language, initialContent, title) {
        const config = vscode.workspace.getConfiguration('tempnote');
        const defaultLanguage = config.get('defaultLanguage', 'plaintext');
        const showWelcome = config.get('showWelcomeText', true);
        const autoNumber = config.get('autoNumber', true);
        const persistentMode = config.get('persistentMode', false);
        const selectedLanguage = language || defaultLanguage;
        const noteId = autoNumber ? `temp-note-${this.noteCounter++}` : `temp-note-${Date.now()}`;
        const noteTitle = title || `临时便签 ${this.noteCounter - 1}`;
        let content = initialContent || '';
        if (!initialContent && showWelcome) {
            content = this.getWelcomeText(selectedLanguage);
        }
        const noteData = {
            id: noteId,
            content: content,
            language: selectedLanguage,
            created: Date.now(),
            title: noteTitle,
            persistent: persistentMode,
        };
        this.tempNotes.set(noteId, noteData);
        // 如果启用了持久化模式，保存到磁盘
        if (persistentMode) {
            this.saveToDisk(noteData);
        }
        const uri = vscode.Uri.parse(`tempnote:${noteId}`);
        return uri;
    }
    updateTempNote(uri, content) {
        const noteId = uri.path.substring(1);
        const note = this.tempNotes.get(noteId);
        if (note) {
            note.content = content;
            this._onDidChange.fire(uri);
            // 如果是持久化的便签，保存到磁盘
            if (note.persistent) {
                this.saveToDisk(note);
            }
        }
    }
    deleteTempNote(uri) {
        const noteId = uri.path.substring(1);
        const note = this.tempNotes.get(noteId);
        if (note && note.persistent) {
            this.deleteFromDisk(note);
        }
        this.tempNotes.delete(noteId);
    }
    renameTempNote(noteId, newTitle) {
        const note = this.tempNotes.get(noteId);
        if (note) {
            const oldTitle = note.title;
            note.title = newTitle;
            if (note.persistent) {
                this.deleteFromDisk({ ...note, title: oldTitle });
                this.saveToDisk(note);
            }
        }
    }
    clearAllTempNotes() {
        // 清除持久化的便签
        for (const note of this.tempNotes.values()) {
            if (note.persistent) {
                this.deleteFromDisk(note);
            }
        }
        this.tempNotes.clear();
        this.noteCounter = 1;
    }
    getAllTempNotes() {
        return Array.from(this.tempNotes.values());
    }
    togglePersistence() {
        const config = vscode.workspace.getConfiguration('tempnote');
        const currentMode = config.get('persistentMode', false);
        config.update('persistentMode', !currentMode, vscode.ConfigurationTarget.Workspace);
        const newMode = !currentMode;
        // 更新现有便签的持久化状态
        for (const note of this.tempNotes.values()) {
            if (newMode && !note.persistent) {
                // 从临时模式切换到持久化模式
                note.persistent = true;
                this.saveToDisk(note);
            }
            else if (!newMode && note.persistent) {
                // 从持久化模式切换到临时模式
                note.persistent = false;
                this.deleteFromDisk(note);
            }
        }
        vscode.window.showInformationMessage(`已${newMode ? '启用' : '禁用'}持久化模式`);
    }
    saveToDisk(note) {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }
        const config = vscode.workspace.getConfiguration('tempnote');
        const storageLocation = config.get('storageLocation', '.vscode/tempnotes');
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const storageDir = path.join(workspaceRoot, storageLocation);
        // 确保存储目录存在
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        const fileName = `${note.title.replace(/[<>:"/\\|?*]/g, '_')}.${this.getFileExtension(note.language)}`;
        const filePath = path.join(storageDir, fileName);
        const metadata = {
            id: note.id,
            language: note.language,
            created: note.created,
            title: note.title,
        };
        const fileContent = `<!-- TempNote Metadata: ${JSON.stringify(metadata)} -->\n${note.content}`;
        try {
            fs.writeFileSync(filePath, fileContent, 'utf8');
        }
        catch (error) {
            vscode.window.showErrorMessage(`保存便签失败: ${error}`);
        }
    }
    deleteFromDisk(note) {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }
        const config = vscode.workspace.getConfiguration('tempnote');
        const storageLocation = config.get('storageLocation', '.vscode/tempnotes');
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const storageDir = path.join(workspaceRoot, storageLocation);
        const fileName = `${note.title.replace(/[<>:"/\\|?*]/g, '_')}.${this.getFileExtension(note.language)}`;
        const filePath = path.join(storageDir, fileName);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`删除便签文件失败: ${error}`);
        }
    }
    loadFromDisk() {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }
        const config = vscode.workspace.getConfiguration('tempnote');
        const storageLocation = config.get('storageLocation', '.vscode/tempnotes');
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const storageDir = path.join(workspaceRoot, storageLocation);
        if (!fs.existsSync(storageDir)) {
            return;
        }
        try {
            const files = fs.readdirSync(storageDir);
            for (const file of files) {
                const filePath = path.join(storageDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                // 解析元数据
                const metadataMatch = content.match(/<!-- TempNote Metadata: (.*?) -->/);
                if (metadataMatch) {
                    try {
                        const metadata = JSON.parse(metadataMatch[1]);
                        const noteContent = content.replace(/<!-- TempNote Metadata: .*? -->\n/, '');
                        const noteData = {
                            id: metadata.id,
                            content: noteContent,
                            language: metadata.language,
                            created: metadata.created,
                            title: metadata.title,
                            persistent: true,
                        };
                        this.tempNotes.set(metadata.id, noteData);
                        // 更新计数器
                        const match = metadata.id.match(/temp-note-(\d+)/);
                        if (match) {
                            const num = parseInt(match[1]);
                            if (num >= this.noteCounter) {
                                this.noteCounter = num + 1;
                            }
                        }
                    }
                    catch (parseError) {
                        console.warn(`解析便签元数据失败: ${file}`, parseError);
                    }
                }
            }
        }
        catch (error) {
            vscode.window.showWarningMessage(`加载持久化便签失败: ${error}`);
        }
    }
    getFileExtension(language) {
        const extensions = {
            javascript: 'js',
            typescript: 'ts',
            python: 'py',
            java: 'java',
            cpp: 'cpp',
            csharp: 'cs',
            go: 'go',
            rust: 'rs',
            php: 'php',
            html: 'html',
            css: 'css',
            json: 'json',
            xml: 'xml',
            yaml: 'yml',
            markdown: 'md',
            sql: 'sql',
        };
        return extensions[language] || 'txt';
    }
    getWelcomeText(language) {
        const timestamp = new Date().toLocaleString('zh-CN');
        const config = vscode.workspace.getConfiguration('tempnote');
        const persistentMode = config.get('persistentMode', false);
        const persistentInfo = persistentMode
            ? '这是一个持久化便签，会保存到项目中直到手动删除。'
            : '这是一个临时文件，关闭 VS Code 后内容会自动清空。';
        const welcomeTexts = {
            plaintext: `# 临时便签
创建时间: ${timestamp}

${persistentInfo}
你可以在这里：
- 记录临时想法
- 粘贴临时数据
- 做简单的笔记
- 测试文本处理

快捷键：
- Ctrl+Shift+T (新建临时便签)
- Ctrl+Shift+Alt+T (选择语言新建)
`,
            javascript: `// 临时 JavaScript 便签
// 创建时间: ${timestamp}

console.log('Hello from temp note!');

// ${persistentInfo}
// 在这里测试你的 JavaScript 代码

function tempFunction() {
    // 你的代码...
}
`,
            typescript: `// 临时 TypeScript 便签
// 创建时间: ${timestamp}

interface TempInterface {
    name: string;
    value: number;
}

console.log('Hello from temp TypeScript note!');

// ${persistentInfo}
// 在这里测试你的 TypeScript 代码
`,
            python: `# 临时 Python 便签
# 创建时间: ${timestamp}

print("Hello from temp Python note!")

# ${persistentInfo}
# 在这里测试你的 Python 代码

def temp_function():
    # 你的代码...
    pass
`,
            markdown: `# 临时 Markdown 便签

**创建时间**: ${timestamp}

${persistentInfo}

## 你可以在这里：

- [ ] 记录待办事项
- [ ] 写临时的文档
- [ ] 测试 Markdown 语法

### 代码示例

\`\`\`javascript
console.log('Hello World!');
\`\`\`

> 这是一个引用块
`,
            json: `{
  "note": "临时 JSON 便签",
  "created": "${timestamp}",
  "description": "${persistentInfo}",
  "data": {
    "example": "value",
    "number": 123,
    "boolean": true,
    "array": [1, 2, 3],
    "nested": {
      "key": "value"
    }
  }
}`,
            html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>临时HTML便签</title>
</head>
<body>
    <h1>临时 HTML 便签</h1>
    <p>创建时间: ${timestamp}</p>
    <p>${persistentInfo}</p>

    <!-- 在这里编写你的 HTML 代码 -->

</body>
</html>`,
            css: `/* 临时 CSS 便签 */
/* 创建时间: ${timestamp} */

/* ${persistentInfo} */

.temp-class {
    color: #333;
    font-size: 16px;
    padding: 10px;
    margin: 5px;
}

/* 在这里编写你的 CSS 代码 */
`,
            sql: `-- 临时 SQL 便签
-- 创建时间: ${timestamp}

-- ${persistentInfo}

SELECT
    'Hello from temp SQL note!' as message,
    NOW() as current_time;

-- 在这里编写你的 SQL 代码
`,
        };
        return welcomeTexts[language] || welcomeTexts['plaintext'];
    }
}
class TempNoteExplorer {
    tempNoteProvider;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(tempNoteProvider) {
        this.tempNoteProvider = tempNoteProvider;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    // 或者在 getChildren 方法中的创建部分修改如下：
    getChildren(element) {
        if (!element) {
            const notes = this.tempNoteProvider.getAllTempNotes();
            return Promise.resolve(notes.map(note => {
                const item = new vscode.TreeItem(note.title, vscode.TreeItemCollapsibleState.None); // 类型断言
                // 立即设置 noteData
                item.noteData = note;
                item.tooltip = `${note.title}\n创建时间: ${new Date(note.created).toLocaleString('zh-CN')}\n语言: ${note.language}\n${note.persistent ? '持久化' : '临时'}`;
                item.description = `${note.language} ${note.persistent ? '📌' : '⏱️'}`;
                item.contextValue = 'tempNote';
                item.iconPath = this.getIconForLanguage(note.language);
                // 设置点击事件
                item.command = {
                    command: 'tempnote.openNote',
                    title: '打开便签',
                    arguments: [note.id],
                };
                return item;
            }));
        }
        return Promise.resolve([]);
    }
    getIconForLanguage(language) {
        const iconMap = {
            javascript: 'file-code',
            typescript: 'file-code',
            python: 'file-code',
            java: 'file-code',
            cpp: 'file-code',
            csharp: 'file-code',
            go: 'file-code',
            rust: 'file-code',
            php: 'file-code',
            html: 'file-media',
            css: 'symbol-color',
            json: 'json',
            xml: 'file-code',
            yaml: 'file-code',
            markdown: 'markdown',
            sql: 'database',
            plaintext: 'file-text',
        };
        return new vscode.ThemeIcon(iconMap[language] || 'file-text');
    }
}
let tempNoteProvider;
let tempNoteExplorer;
function activate(context) {
    console.log('TempNote 插件已激活');
    // 创建临时便签提供者
    tempNoteProvider = new TempNoteProvider(context);
    // 加载持久化的便签
    tempNoteProvider.loadFromDisk();
    // 创建侧边栏浏览器
    tempNoteExplorer = new TempNoteExplorer(tempNoteProvider);
    // 注册内容提供者
    const providerDisposable = vscode.workspace.registerTextDocumentContentProvider('tempnote', tempNoteProvider);
    // 注册树视图提供者
    const treeViewDisposable = vscode.window.createTreeView('tempnoteExplorer', {
        treeDataProvider: tempNoteExplorer,
        showCollapseAll: false,
    });
    // 注册命令
    const commands = [
        // 新建临时便签
        vscode.commands.registerCommand('tempnote.newTempNote', async () => {
            await createAndOpenTempNote();
            tempNoteExplorer.refresh();
        }),
        // 新建临时便签（选择语言）
        vscode.commands.registerCommand('tempnote.newTempNoteWithLanguage', async () => {
            const language = await showLanguagePicker();
            if (language) {
                await createAndOpenTempNote(language);
                tempNoteExplorer.refresh();
            }
        }),
        // 新建临时Markdown
        vscode.commands.registerCommand('tempnote.newTempMarkdown', async () => {
            await createAndOpenTempNote('markdown');
            tempNoteExplorer.refresh();
        }),
        // 新建临时JSON
        vscode.commands.registerCommand('tempnote.newTempJSON', async () => {
            await createAndOpenTempNote('json');
            tempNoteExplorer.refresh();
        }),
        // 清空所有临时便签
        vscode.commands.registerCommand('tempnote.clearAllTempNotes', async () => {
            const result = await vscode.window.showWarningMessage('确定要清空所有临时便签吗？此操作不可撤销！', { modal: true }, '确定', '取消');
            if (result === '确定') {
                // 关闭所有临时便签编辑器
                const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
                const tempNoteTabs = tabs.filter(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'tempnote');
                for (const tab of tempNoteTabs) {
                    await vscode.window.tabGroups.close(tab);
                }
                tempNoteProvider.clearAllTempNotes();
                tempNoteExplorer.refresh();
                vscode.window.showInformationMessage('已清空所有临时便签');
            }
        }),
        // 刷新浏览器
        vscode.commands.registerCommand('tempnote.refreshExplorer', () => {
            tempNoteExplorer.refresh();
        }),
        // 打开便签
        vscode.commands.registerCommand('tempnote.openNote', async (noteId) => {
            const uri = vscode.Uri.parse(`tempnote:${noteId}`);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
        }),
        // 在 extension.ts 中，修复删除便签命令的部分
        vscode.commands.registerCommand('tempnote.deleteNote', async (item) => {
            // 添加类型检查
            if (!item.noteData) {
                vscode.window.showErrorMessage('无法获取便签数据');
                return;
            }
            const result = await vscode.window.showWarningMessage(`确定要删除便签 "${item.noteData.title}" 吗？`, '确定', '取消');
            if (result === '确定') {
                // 关闭对应的编辑器
                const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
                const targetTab = tabs.find(tab => tab.input instanceof vscode.TabInputText &&
                    tab.input.uri.scheme === 'tempnote' &&
                    tab.input.uri.path.includes(item.noteData.id) // 使用非空断言，因为我们已经检查过了
                );
                if (targetTab) {
                    await vscode.window.tabGroups.close(targetTab);
                }
                const uri = vscode.Uri.parse(`tempnote:${item.noteData.id}`);
                tempNoteProvider.deleteTempNote(uri);
                tempNoteExplorer.refresh();
                vscode.window.showInformationMessage(`已删除便签 "${item.noteData.title}"`);
            }
        }),
        // 修复重命名便签命令的部分
        vscode.commands.registerCommand('tempnote.renameNote', async (item) => {
            // 添加类型检查
            if (!item.noteData) {
                vscode.window.showErrorMessage('无法获取便签数据');
                return;
            }
            const newTitle = await vscode.window.showInputBox({
                prompt: '输入新的便签标题',
                value: item.noteData.title,
                validateInput: value => {
                    if (!value || value.trim().length === 0) {
                        return '标题不能为空';
                    }
                    if (value.length > 50) {
                        return '标题长度不能超过50个字符';
                    }
                    return null;
                },
            });
            if (newTitle && newTitle !== item.noteData.title) {
                tempNoteProvider.renameTempNote(item.noteData.id, newTitle.trim());
                tempNoteExplorer.refresh();
                vscode.window.showInformationMessage(`便签已重命名为 "${newTitle.trim()}"`);
            }
        }),
        // 切换持久化模式
        vscode.commands.registerCommand('tempnote.togglePersistence', () => {
            tempNoteProvider.togglePersistence();
            tempNoteExplorer.refresh();
        }),
    ];
    // 监听文档变化
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.scheme === 'tempnote') {
            tempNoteProvider.updateTempNote(event.document.uri, event.document.getText());
        }
    });
    // 监听标签页关闭
    const tabChangeDisposable = vscode.window.tabGroups.onDidChangeTabs(event => {
        let needRefresh = false;
        for (const tab of event.closed) {
            if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'tempnote') {
                // 检查便签是否为临时模式，如果是则删除
                const noteId = tab.input.uri.path.substring(1);
                const notes = tempNoteProvider.getAllTempNotes();
                const note = notes.find(n => n.id === noteId);
                if (note && !note.persistent) {
                    tempNoteProvider.deleteTempNote(tab.input.uri);
                    needRefresh = true;
                }
            }
        }
        if (needRefresh) {
            tempNoteExplorer.refresh();
        }
    });
    // 监听工作区配置变化
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('tempnote')) {
            tempNoteExplorer.refresh();
        }
    });
    // 监听工作区文件夹变化
    const workspaceChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        // 重新加载持久化便签
        tempNoteProvider.loadFromDisk();
        tempNoteExplorer.refresh();
    });
    context.subscriptions.push(providerDisposable, treeViewDisposable, changeDisposable, tabChangeDisposable, configChangeDisposable, workspaceChangeDisposable, ...commands);
    // 显示激活消息
    const config = vscode.workspace.getConfiguration('tempnote');
    const persistentMode = config.get('persistentMode', false);
    vscode.window
        .showInformationMessage(`TempNote 已激活! ${persistentMode ? '持久化模式' : '临时模式'} - 按 Ctrl+Shift+T 创建便签`, '创建便签', '打开侧边栏')
        .then(selection => {
        if (selection === '创建便签') {
            vscode.commands.executeCommand('tempnote.newTempNote');
        }
        else if (selection === '打开侧边栏') {
            vscode.commands.executeCommand('tempnoteExplorer.focus');
        }
    });
}
exports.activate = activate;
async function createAndOpenTempNote(language, title) {
    try {
        const uri = tempNoteProvider.createTempNote(language, undefined, title);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
        // 设置语言模式
        const noteData = tempNoteProvider.getAllTempNotes().find(note => uri.path.includes(note.id));
        if (noteData && noteData.language !== 'plaintext') {
            await vscode.languages.setTextDocumentLanguage(document, noteData.language);
        }
        // 将光标移到文档末尾
        const lastLine = document.lineCount - 1;
        const lastCharacter = document.lineAt(lastLine).text.length;
        editor.selection = new vscode.Selection(lastLine, lastCharacter, lastLine, lastCharacter);
    }
    catch (error) {
        vscode.window.showErrorMessage(`创建临时便签失败: ${error}`);
    }
}
async function showLanguagePicker() {
    const languages = [
        { label: '$(file-text) 纯文本', value: 'plaintext' },
        { label: '$(file-code) JavaScript', value: 'javascript' },
        { label: '$(file-code) TypeScript', value: 'typescript' },
        { label: '$(file-code) Python', value: 'python' },
        { label: '$(file-code) Java', value: 'java' },
        { label: '$(file-code) C++', value: 'cpp' },
        { label: '$(file-code) C#', value: 'csharp' },
        { label: '$(file-code) Go', value: 'go' },
        { label: '$(file-code) Rust', value: 'rust' },
        { label: '$(file-code) PHP', value: 'php' },
        { label: '$(file-media) HTML', value: 'html' },
        { label: '$(symbol-color) CSS', value: 'css' },
        { label: '$(json) JSON', value: 'json' },
        { label: '$(file-code) XML', value: 'xml' },
        { label: '$(file-code) YAML', value: 'yaml' },
        { label: '$(markdown) Markdown', value: 'markdown' },
        { label: '$(database) SQL', value: 'sql' },
    ];
    const selected = await vscode.window.showQuickPick(languages, {
        placeHolder: '选择临时便签的语言类型',
        matchOnDescription: true,
    });
    return selected?.value;
}
function deactivate() {
    // 只清理临时（非持久化）的便签
    if (tempNoteProvider) {
        const config = vscode.workspace.getConfiguration('tempnote');
        const persistentMode = config.get('persistentMode', false);
        if (!persistentMode) {
            // 只在临时模式下清理所有便签
            const notes = tempNoteProvider.getAllTempNotes();
            for (const note of notes) {
                if (!note.persistent) {
                    const uri = vscode.Uri.parse(`tempnote:${note.id}`);
                    tempNoteProvider.deleteTempNote(uri);
                }
            }
        }
    }
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map