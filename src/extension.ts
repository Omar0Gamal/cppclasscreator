import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Retrieves the COPYRIGHT.txt content from the given folder.
 * In this version, we always use the root workspace folder.
 * If not present, prompts for author and project name, creates the file, and returns the notice.
 */
async function getOrCreateCopyrightNotice(
    rootFolder: vscode.Uri
): Promise<string> {
    const copyrightUri = vscode.Uri.joinPath(rootFolder, 'COPYRIGHT.txt');
    try {
        await vscode.workspace.fs.stat(copyrightUri);
        const data = await vscode.workspace.fs.readFile(copyrightUri);
        return Buffer.from(data).toString('utf8');
    } catch {
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
        await vscode.workspace.fs.writeFile(copyrightUri, Buffer.from(notice, 'utf8'));
        return notice;
    }
}

/**
 * Prompts the user to select a subfolder from the given folder.
 * Provides a list of subdirectories and an option to use the current folder.
 */
async function selectSubFolder(root: vscode.Uri): Promise<vscode.Uri | undefined> {
    let subdirs: vscode.Uri[];
    try {
        const entries = await vscode.workspace.fs.readDirectory(root);
        const dirs = entries.filter(([_, fileType]) => fileType === vscode.FileType.Directory);
        subdirs = dirs.map(([name, _]) => vscode.Uri.joinPath(root, name));
    } catch (error) {
        vscode.window.showErrorMessage("Failed to read subdirectories: " + error);
        return undefined;
    }
    const items = subdirs.map(uri => ({
        label: path.basename(uri.fsPath),
        uri
    }));
    items.unshift({
        label: "(Use current folder)",
        uri: root
    });
    const selected = await vscode.window.showQuickPick(
        items.map(item => item.label),
        { placeHolder: 'Select a base folder from subdirectories' }
    );
    if (!selected) {
        return undefined;
    }
    const found = items.find(item => item.label === selected);
    return found?.uri;
}

/**
 * Prompts the user to select a base folder.
 * If there are multiple workspace folders, it shows a picker of those.
 * If only one, it then shows a picker of its subdirectories.
 */
async function selectBaseFolder(): Promise<vscode.Uri | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return undefined;
    }
    if (folders.length === 1) {
        return await selectSubFolder(folders[0].uri);
    }
    // If multiple workspace folders exist, let the user pick one.
    const folderNames = folders.map(folder => folder.name);
    const selectedName = await vscode.window.showQuickPick(folderNames, {
        placeHolder: 'Select the workspace folder'
    });
    if (!selectedName) {
        return undefined;
    }
    const selectedFolder = folders.find(folder => folder.name === selectedName);
    return await selectSubFolder(selectedFolder!.uri);
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.createClassFiles', async () => {
        // Always use the root folder (first workspace folder) for COPYRIGHT.txt.
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        const rootFolder = workspaceFolders[0].uri;

        // Select the base folder (a subfolder of a workspace folder) for file generation.
        const baseFolder = await selectBaseFolder();
        if (!baseFolder) { return; }
        const wsPath = baseFolder.fsPath;

        // Get the COPYRIGHT notice from the root folder.
        let copyrightNotice: string;
        try {
            copyrightNotice = await getOrCreateCopyrightNotice(rootFolder);
        } catch (error: any) {
            vscode.window.showErrorMessage(error.message);
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
            prompt: 'Enter namespace (e.g., nebula::math) or leave empty'
        });
        let openNamespaces = '';
        let closeNamespaces = '';
        if (nsInput && nsInput.trim().length > 0) {
            const nsParts = nsInput.split('::').map(s => s.trim()).filter(s => s.length > 0);
            if (nsParts.length > 0) {
                openNamespaces = nsParts.map(ns => `namespace ${ns} {`).join('\n');
                closeNamespaces = nsParts.map(() => '}').join('\n');
            }
        }

        // Ask whether to place the files in the same folder or in separate folders.
        const placementOption = await vscode.window.showQuickPick(
            ['Same Folder', 'Separate Folders'],
            { placeHolder: 'Choose file placement' }
        );
        if (!placementOption) { return; }

        if (placementOption === 'Separate Folders') {
            // Prompt for header subfolder (e.g., "include/math").
            const headerFolderInput = await vscode.window.showInputBox({
                prompt: 'Enter header subfolder (relative to base, e.g., include/math)',
                value: 'include'
            });
            if (!headerFolderInput) { return; }
            const headerSubfolder = headerFolderInput.trim();

            // Auto-suggest source subfolder by replacing "include" with "src" if applicable.
            let defaultSourceSubfolder = headerSubfolder.replace(/^include[\/\\]?/, 'src/');
            if (defaultSourceSubfolder === headerSubfolder) {
                defaultSourceSubfolder = 'src';
            }
            const sourceFolderInput = await vscode.window.showInputBox({
                prompt: 'Enter source subfolder (relative to base, e.g., src/math)',
                value: defaultSourceSubfolder
            });
            if (!sourceFolderInput) { return; }
            const sourceSubfolder = sourceFolderInput.trim();

            // Compute absolute paths.
            const headerFolderPath = path.join(wsPath, headerSubfolder);
            const sourceFolderPath = path.join(wsPath, sourceSubfolder);

            // For the include directive in the .cpp, simplify by removing "include" prefix.
            let directiveFolder = headerSubfolder;
            if (/^include[\/\\]/.test(headerSubfolder)) {
                directiveFolder = headerSubfolder.replace(/^include[\/\\]/, '');
            }
            const includeDirective = directiveFolder
                ? `#include "${directiveFolder}/${className}.hpp"`
                : `#include "${className}.hpp"`;

            // Generate header content (.hpp): Copyright (from root), then #pragma once, then namespaces and class.
            let headerContent = `${copyrightNotice}\n\n`;
            headerContent += "#pragma once\n\n";
            if (openNamespaces) {
                headerContent += `${openNamespaces}\n\n`;
            }
            headerContent += `class ${className} {\n`;
            headerContent += `public:\n    ${className}();\n    ~${className}();\n\n`;
            headerContent += `private:\n    // Members...\n};\n\n`;
            if (closeNamespaces) {
                headerContent += `${closeNamespaces}\n`;
            }

            // Generate source content (.cpp) with simplified include directive.
            let sourceContent = `${copyrightNotice}\n\n`;
            sourceContent += `${includeDirective}\n\n`;
            if (openNamespaces) {
                sourceContent += `${openNamespaces}\n\n`;
            }
            sourceContent += `${className}::${className}() {\n    // Constructor implementation\n}\n\n`;
            sourceContent += `${className}::~${className}() {\n    // Destructor implementation\n}\n\n`;
            if (closeNamespaces) {
                sourceContent += `${closeNamespaces}\n`;
            }

            // Define file URIs.
            const headerUri = vscode.Uri.joinPath(
                baseFolder,
                ...headerSubfolder.split('/'),
                `${className}.hpp`
            );
            const sourceUri = vscode.Uri.joinPath(
                baseFolder,
                ...sourceSubfolder.split('/'),
                `${className}.cpp`
            );

            try {
                await vscode.workspace.fs.writeFile(headerUri, Buffer.from(headerContent, 'utf8'));
                await vscode.workspace.fs.writeFile(sourceUri, Buffer.from(sourceContent, 'utf8'));
                vscode.window.showInformationMessage(
                    `Created ${className}.hpp in "${headerSubfolder}" and ${className}.cpp in "${sourceSubfolder}"`
                );
            } catch (error: any) {
                vscode.window.showErrorMessage('Error creating files: ' + error);
            }
        } else {
            // Same folder option.
            const folderInput = await vscode.window.showInputBox({
                prompt: 'Enter folder (relative to base) to place both files (leave empty for base folder)',
                value: ''
            });
            const targetSubfolder = folderInput ? folderInput.trim() : '';
            const targetUri = targetSubfolder
                ? vscode.Uri.joinPath(baseFolder, ...targetSubfolder.split('/'))
                : baseFolder;
            const includeDirective = `#include "${className}.hpp"`;

            let headerContent = `${copyrightNotice}\n\n`;
            headerContent += "#pragma once\n\n";
            if (openNamespaces) {
                headerContent += `${openNamespaces}\n\n`;
            }
            headerContent += `class ${className} {\n`;
            headerContent += `public:\n    ${className}();\n    ~${className}();\n\n`;
            headerContent += `private:\n    // Members...\n};\n\n`;
            if (closeNamespaces) {
                headerContent += `${closeNamespaces}\n`;
            }

            let sourceContent = `${copyrightNotice}\n\n`;
            sourceContent += `${includeDirective}\n\n`;
            if (openNamespaces) {
                sourceContent += `${openNamespaces}\n\n`;
            }
            sourceContent += `${className}::${className}() {\n    // Constructor implementation\n}\n\n`;
            sourceContent += `${className}::~${className}() {\n    // Destructor implementation\n}\n\n`;
            if (closeNamespaces) {
                sourceContent += `${closeNamespaces}\n`;
            }

            const headerUri = vscode.Uri.joinPath(targetUri, `${className}.hpp`);
            const sourceUri = vscode.Uri.joinPath(targetUri, `${className}.cpp`);

            try {
                await vscode.workspace.fs.writeFile(headerUri, Buffer.from(headerContent, 'utf8'));
                await vscode.workspace.fs.writeFile(sourceUri, Buffer.from(sourceContent, 'utf8'));
                vscode.window.showInformationMessage(
                    `Created ${className}.hpp and ${className}.cpp in "${targetSubfolder || 'base folder'}"`
                );
            } catch (error: any) {
                vscode.window.showErrorMessage('Error creating files: ' + error);
            }
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
