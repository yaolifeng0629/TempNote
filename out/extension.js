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
const tempNoteEditor_1 = require("./tempNoteEditor");
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
// 使用原来的TempNoteProvider来保持与现有代码的兼容性
class TempNoteProvider {
    context;
    tempNotes = new Map();
    noteCounter = 1;
    editorProvider;
    constructor(context) {
        this.context = context;
        this.editorProvider = new tempNoteEditor_1.TempNoteEditorProvider(context);
    }
    async createTempNote(language, initialContent, title) {
        const config = vscode.workspace.getConfiguration('tempnote');
        const defaultLanguage = config.get('defaultLanguage', 'plaintext');
        const autoNumber = config.get('autoNumber', true);
        const persistentMode = config.get('persistentMode', false);
        const selectedLanguage = language || defaultLanguage;
        const noteId = autoNumber ? `temp-note-${this.noteCounter++}` : `temp-note-${Date.now()}`;
        const noteTitle = title || `临时便签 ${this.noteCounter - 1}`;
        // 使用编辑器提供者创建实际的文件
        const uri = await this.editorProvider.createTempNote(selectedLanguage, initialContent, noteTitle);
        // 保存便签数据以便在树视图中显示
        const noteData = {
            id: noteId,
            content: initialContent || '',
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
        return uri;
    }
    updateTempNote(uri, content) {
        const noteId = path.basename(uri.fsPath).split('.')[0];
        const note = this.tempNotes.get(noteId);
        if (note) {
            note.content = content;
            // 如果是持久化的便签，保存到磁盘
            if (note.persistent) {
                this.saveToDisk(note);
            }
        }
    }
    deleteTempNote(uri) {
        const noteId = path.basename(uri.fsPath).split('.')[0];
        const note = this.tempNotes.get(noteId);
        if (note && note.persistent) {
            this.deleteFromDisk(note);
        }
        // 删除实际的临时文件
        this.editorProvider.deleteTempNote(noteId);
        // 确保从内存中删除
        if (this.tempNotes.delete(noteId)) {
            console.log(`便签 ${noteId} 已从内存中删除`);
        }
        else {
            console.warn(`便签 ${noteId} 不存在或删除失败`);
        }
    }
    renameTempNote(noteId, newTitle) {
        const note = this.tempNotes.get(noteId);
        if (note) {
            const oldTitle = note.title;
            note.title = newTitle;
            if (note.persistent) {
                this.deleteFromDisk(note);
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
        // 清除所有临时文件
        this.editorProvider.clearAllTempNotes();
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
        // 使用正确的文件扩展名
        const extension = this.getFileExtension(note.language);
        const fileName = `${note.title.replace(/[<>:"/\\|?*]/g, '_')}.${extension}`;
        const filePath = path.join(storageDir, fileName);
        const metadata = {
            id: note.id,
            language: note.language,
            created: note.created,
            title: note.title,
            extension: extension // 添加扩展名到元数据
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
    // 注册树视图提供者
    const treeViewDisposable = vscode.window.createTreeView('tempnoteExplorer', {
        treeDataProvider: tempNoteExplorer,
        showCollapseAll: false,
        canSelectMany: false // 确保只能选择一个项目
    });
    // 注册右键菜单命令
    const contextMenuDisposable = vscode.commands.registerCommand('tempnote.contextMenu.delete', async (item) => {
        if (item && item.noteData) {
            await deleteNote(item);
        }
    });
    // 注册删除键监听
    const deleteKeyDisposable = vscode.commands.registerCommand('tempnote.deleteKeyPressed', async () => {
        // 获取当前选中的项目
        const selection = treeViewDisposable.selection;
        if (selection.length > 0) {
            // 获取第一个选中的项目
            const selectedItem = selection[0];
            // 执行删除操作
            if (selectedItem) {
                await deleteNote(selectedItem);
            }
        }
    });
    // 提取删除便签的通用函数
    async function deleteNote(item) {
        if (!item.noteData) {
            vscode.window.showErrorMessage('无法获取便签数据');
            return;
        }
        const result = await vscode.window.showWarningMessage(`确定要删除便签 "${item.noteData.title}" 吗？`, '确定', '取消');
        if (result === '确定') {
            // 关闭对应的编辑器
            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
            const targetTab = tabs.find(tab => tab.input instanceof vscode.TabInputText &&
                tab.input.uri.scheme === 'file' &&
                tab.input.uri.fsPath.includes(item.noteData.id));
            if (targetTab) {
                await vscode.window.tabGroups.close(targetTab);
            }
            // 删除便签
            tempNoteProvider.editorProvider.deleteTempNote(item.noteData.id);
            tempNoteProvider.tempNotes.delete(item.noteData.id);
            // 强制刷新视图
            tempNoteExplorer.refresh();
            vscode.window.showInformationMessage(`已删除便签 "${item.noteData.title}"`);
        }
    }
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
                const tempNoteTabs = tabs.filter(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file' &&
                    tab.input.uri.fsPath.includes('vscode-tempnote'));
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
            // 使用编辑器提供者打开便签
            await tempNoteProvider.editorProvider.openTempNote(noteId);
        }),
        // 在 extension.ts 中，修复删除便签命令的部分
        vscode.commands.registerCommand('tempnote.deleteNote', async (item) => {
            await deleteNote(item);
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
    context.subscriptions.push(treeViewDisposable, contextMenuDisposable, deleteKeyDisposable, configChangeDisposable, workspaceChangeDisposable, ...commands);
    // 显示激活消息
    const config = vscode.workspace.getConfiguration('tempnote');
    const persistentMode = config.get('persistentMode', false);
    vscode.window.showInformationMessage(`TempNote 已激活! ${persistentMode ? '持久化模式' : '临时模式'} - 按 Ctrl+Shift+T 创建便签`, '创建便签', '打开侧边栏').then(selection => {
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
        const uri = await tempNoteProvider.createTempNote(language, undefined, title);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
        // 设置语言模式
        const noteId = path.basename(uri.fsPath).split('.')[0]; // 从文件名中获取noteId
        const noteData = tempNoteProvider.getAllTempNotes().find(note => note.id === noteId);
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
                    tempNoteProvider.editorProvider.deleteTempNote(note.id);
                }
            }
        }
    }
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map