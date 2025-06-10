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
exports.TempNoteEditorProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
// 临时文件的存储目录
const TEMP_DIR = path.join(os.tmpdir(), 'vscode-tempnote');
// 确保临时目录存在
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
/**
 * 临时便签编辑器提供者
 * 使用真实的临时文件而不是虚拟文档，这样可以完全支持编辑功能
 */
class TempNoteEditorProvider {
    context;
    tempFiles = new Map(); // noteId -> filePath
    noteCounter = 1;
    constructor(context) {
        this.context = context;
    }
    /**
     * 创建一个新的临时便签
     */
    async createTempNote(language, initialContent, title) {
        // 获取配置
        const config = vscode.workspace.getConfiguration('tempnote');
        const defaultLanguage = config.get('defaultLanguage', 'plaintext');
        const showWelcome = config.get('showWelcomeText', true);
        const autoNumber = config.get('autoNumber', true);
        // 设置便签信息
        const selectedLanguage = language || defaultLanguage;
        const noteId = autoNumber ? `temp-note-${this.noteCounter++}` : `temp-note-${Date.now()}`;
        const noteTitle = title || `临时便签 ${this.noteCounter - 1}`;
        // 创建内容
        let content = initialContent || '';
        if (!initialContent && showWelcome) {
            content = this.getWelcomeText(selectedLanguage);
        }
        // 创建临时文件
        const extension = this.getFileExtension(selectedLanguage);
        const tempFilePath = path.join(TEMP_DIR, `${noteId}.${extension}`);
        // 写入内容
        fs.writeFileSync(tempFilePath, content, 'utf8');
        // 保存映射关系 - 同时保存文件扩展名信息
        this.tempFiles.set(noteId, tempFilePath);
        // 返回文件URI
        return vscode.Uri.file(tempFilePath);
    }
    /**
     * 打开临时便签
     */
    async openTempNote(noteId) {
        let filePath = this.tempFiles.get(noteId);
        if (!filePath) {
            // 尝试在临时目录中查找文件
            const files = fs.readdirSync(TEMP_DIR);
            const targetFile = files.find(file => file.startsWith(noteId + '.'));
            if (targetFile) {
                filePath = path.join(TEMP_DIR, targetFile);
                // 找到了文件，将其添加到映射中
                this.tempFiles.set(noteId, filePath);
            }
            else {
                // 如果在工作区有持久化存储，尝试在工作区查找
                if (vscode.workspace.workspaceFolders) {
                    const config = vscode.workspace.getConfiguration('tempnote');
                    const storageLocation = config.get('storageLocation', '.vscode/tempnotes');
                    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    const storageDir = path.join(workspaceRoot, storageLocation);
                    if (fs.existsSync(storageDir)) {
                        const workspaceFiles = fs.readdirSync(storageDir);
                        // 读取每个文件查找匹配的noteId
                        for (const file of workspaceFiles) {
                            const fullPath = path.join(storageDir, file);
                            const content = fs.readFileSync(fullPath, 'utf8');
                            const metadataMatch = content.match(/<!-- TempNote Metadata: (.*?) -->/);
                            if (metadataMatch) {
                                try {
                                    const metadata = JSON.parse(metadataMatch[1]);
                                    if (metadata.id === noteId) {
                                        filePath = fullPath;
                                        this.tempFiles.set(noteId, filePath);
                                        break;
                                    }
                                }
                                catch (e) {
                                    console.error(`解析文件元数据失败: ${file}`, e);
                                }
                            }
                        }
                    }
                }
            }
            if (!filePath) {
                throw new Error(`找不到便签: ${noteId}`);
            }
        }
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
    }
    /**
     * 注册临时文件路径
     * 用于从磁盘加载便签时，将文件路径注册到tempFiles映射中
     */
    registerTempFile(noteId, filePath) {
        this.tempFiles.set(noteId, filePath);
    }
    /**
     * 删除临时便签
     */
    deleteTempNote(noteId) {
        const filePath = this.tempFiles.get(noteId);
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                this.tempFiles.delete(noteId);
            }
            catch (error) {
                console.error(`删除临时文件失败: ${error}`);
            }
        }
    }
    /**
     * 清空所有临时便签
     */
    clearAllTempNotes() {
        for (const [noteId, filePath] of this.tempFiles.entries()) {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                }
                catch (error) {
                    console.error(`删除临时文件失败: ${error}`);
                }
            }
        }
        this.tempFiles.clear();
        this.noteCounter = 1;
    }
    /**
     * 获取文件扩展名
     */
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
            plaintext: 'txt'
        };
        return extensions[language] || 'txt';
    }
    /**
     * 获取欢迎文本
     */
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
exports.TempNoteEditorProvider = TempNoteEditorProvider;
//# sourceMappingURL=tempNoteEditor.js.map