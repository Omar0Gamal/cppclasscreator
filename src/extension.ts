import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Retrieves the COPYRIGHT.txt content from the workspace root.
 * If not present, prompts the user for their name and project name,
 * creates the file, and returns the generated notice.
 */
async function getOrCreateCopyrightNotice(workspaceFolder: vscode.Uri): Promise<string> {
    const copyrightFile = vscode.Uri.joinPath(workspaceFolder, 'COPYRIGHT.txt');
    try {
        // If the file exists, read its contents.
        await vscode.workspace.fs.stat(copyrightFile);
        const data = await vscode.workspace.fs.readFile(copyrightFile);
        return Buffer.from(data).toString('utf8');
    } catch (error) {
        // File doesn't exist; prompt for info.
        const author = await vscode.window.showInputBox({
            prompt: 'Enter your name (for copyright notice)'
        });
        if (!author) {
            vscode.window.showErrorMessage('Author name is required.');
            throw new Error('Author name is required.');
        }
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter the project name'
        });
        if (!projectName) {
            vscode.window.showErrorMessage('Project name is required.');
            throw new Error('Project name is required.');
        }
        const notice =
`/*
 * Copyright (c) 2025 ${author}
 * All rights reserved.
 *
 * This file is part of ${projectName}.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */
`;
        await vscode.workspace.fs.writeFile(copyrightFile, Buffer.from(notice, 'utf8'));
        return notice;
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.createClassFiles', async () => {
        // Ensure a workspace is open.
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        const workspaceFolder = workspaceFolders[0].uri;
        const wsPath = workspaceFolder.fsPath;

        // Get or create the COPYRIGHT.txt notice.
        let copyrightNotice: string;
        try {
            copyrightNotice = await getOrCreateCopyrightNotice(workspaceFolder);
        } catch (error) {
            return;
        }

        // Prompt for the class name.
        const className = await vscode.window.showInputBox({
            prompt: 'Enter the class name'
        });
        if (!className) {
            vscode.window.showErrorMessage('Class name is required.');
            return;
        }

        // Prompt for the namespace (e.g., "nebula::math").
        const nsInput = await vscode.window.showInputBox({
            prompt: 'Enter namespace (e.g. nebula::math) or leave empty'
        });

        // Process namespace input into nested namespace blocks.
        let openNamespaces = '';
        let closeNamespaces = '';
        if (nsInput && nsInput.trim().length > 0) {
            const nsParts = nsInput.split('::').map(part => part.trim()).filter(part => part.length > 0);
            if (nsParts.length > 0) {
                openNamespaces = nsParts.map(ns => `namespace ${ns} {`).join('\n');
                closeNamespaces = nsParts.map(() => '}').join('\n');
            }
        }

        // Ask how to place the generated files.
        const placementOption = await vscode.window.showQuickPick(
            ["Place files in the same folder", "Place header and source in separate folders"],
            { placeHolder: "Choose file placement" }
        );
        if (!placementOption) {
            return;
        }

        if (placementOption === "Place header and source in separate folders") {
            // Prompt for header and source subfolders separately.
            const headerFolderInput = await vscode.window.showInputBox({
                prompt: 'Enter header subfolder (relative to workspace, default: include)',
                value: 'include'
            });
            const sourceFolderInput = await vscode.window.showInputBox({
                prompt: 'Enter source subfolder (relative to workspace, default: src)',
                value: 'src'
            });
            const headerFolder = headerFolderInput ? headerFolderInput.trim() : 'include';
            const sourceFolder = sourceFolderInput ? sourceFolderInput.trim() : 'src';

            // Compute absolute paths.
            const headerFolderPath = path.join(wsPath, headerFolder);
            const sourceFolderPath = path.join(wsPath, sourceFolder);

            // Compute relative path from source folder to header folder for the include directive.
            let relativeHeaderPath = path.relative(sourceFolderPath, headerFolderPath);
            // Normalize to forward slashes.
            relativeHeaderPath = relativeHeaderPath.split(path.sep).join('/');
            const includeDirective = relativeHeaderPath ? `#include "${relativeHeaderPath}/${className}.hpp"` : `#include "${className}.hpp"`;

            // Create header file content (.hpp) using #pragma once.
            let headerContent = `${copyrightNotice}\n`;
            if (openNamespaces) {
                headerContent += `${openNamespaces}\n\n`;
            }
            headerContent += "#pragma once\n\n";
            headerContent += `class ${className} {\n`;
            headerContent += `public:\n    ${className}();\n    ~${className}();\n\n`;
            headerContent += `private:\n    // Members...\n};\n\n`;
            if (closeNamespaces) {
                headerContent += `${closeNamespaces}\n`;
            }

            // Create source file content (.cpp) with namespace blocks wrapping the definitions.
            let sourceContent = `${copyrightNotice}\n`;
            sourceContent += `${includeDirective}\n\n`;
            if (openNamespaces) {
                sourceContent += `${openNamespaces}\n\n`;
            }
            sourceContent += `${className}::${className}() {\n    // Constructor implementation\n}\n\n`;
            sourceContent += `${className}::~${className}() {\n    // Destructor implementation\n}\n\n`;
            if (closeNamespaces) {
                sourceContent += `${closeNamespaces}\n`;
            }

            // Define URIs for header and source files.
            const headerUri = vscode.Uri.joinPath(workspaceFolder, headerFolder, `${className}.hpp`);
            const sourceUri = vscode.Uri.joinPath(workspaceFolder, sourceFolder, `${className}.cpp`);

            try {
                await vscode.workspace.fs.writeFile(headerUri, Buffer.from(headerContent, 'utf8'));
                await vscode.workspace.fs.writeFile(sourceUri, Buffer.from(sourceContent, 'utf8'));
                vscode.window.showInformationMessage(`Created ${className}.hpp in "${headerFolder}" and ${className}.cpp in "${sourceFolder}"`);
            } catch (error) {
                vscode.window.showErrorMessage('Error creating files: ' + error);
            }
        } else {
            // "Place files in the same folder" option.
            // Prompt for folder (optional; default is workspace root).
            const folderInput = await vscode.window.showInputBox({
                prompt: 'Enter folder to place both files (relative to workspace, leave empty for workspace root)',
                value: ''
            });
            const targetFolder = folderInput ? folderInput.trim() : '';
            // Compute absolute target path.
            const targetFolderUri = targetFolder
                ? vscode.Uri.joinPath(workspaceFolder, targetFolder)
                : workspaceFolder;

            // In single-folder mode, the source file will include the header with a simple include.
            const includeDirective = `#include "${className}.hpp"`;

            // Create header file content (.hpp) using #pragma once.
            let headerContent = `${copyrightNotice}\n`;
            if (openNamespaces) {
                headerContent += `${openNamespaces}\n\n`;
            }
            headerContent += "#pragma once\n\n";
            headerContent += `class ${className} {\n`;
            headerContent += `public:\n    ${className}();\n    ~${className}();\n\n`;
            headerContent += `private:\n    // Members...\n};\n\n`;
            if (closeNamespaces) {
                headerContent += `${closeNamespaces}\n`;
            }

            // Create source file content (.cpp).
            let sourceContent = `${copyrightNotice}\n`;
            sourceContent += `${includeDirective}\n\n`;
            if (openNamespaces) {
                sourceContent += `${openNamespaces}\n\n`;
            }
            sourceContent += `${className}::${className}() {\n    // Constructor implementation\n}\n\n`;
            sourceContent += `${className}::~${className}() {\n    // Destructor implementation\n}\n\n`;
            if (closeNamespaces) {
                sourceContent += `${closeNamespaces}\n`;
            }

            // Define URIs for header and source files.
            const headerUri = vscode.Uri.joinPath(targetFolderUri, `${className}.hpp`);
            const sourceUri = vscode.Uri.joinPath(targetFolderUri, `${className}.cpp`);

            try {
                await vscode.workspace.fs.writeFile(headerUri, Buffer.from(headerContent, 'utf8'));
                await vscode.workspace.fs.writeFile(sourceUri, Buffer.from(sourceContent, 'utf8'));
                vscode.window.showInformationMessage(`Created ${className}.hpp and ${className}.cpp in "${targetFolder || 'workspace root'}"`);
            } catch (error) {
                vscode.window.showErrorMessage('Error creating files: ' + error);
            }
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
