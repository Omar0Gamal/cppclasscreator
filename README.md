# Class File Generator

This VS Code extension generates C++ class files with the following features:

- Prompts for a class name.
- Prompts for a namespace (e.g. "nebula::math") and converts it into nested namespace blocks.
- Prompts whether to:
  - Place header and source files in the same folder, or
  - Place them in separate folders (for example, header in "include" and source in "src").
- Uses a COPYRIGHT.txt file (located at the workspace root) for the copyright notice.
- Generated header files use `#pragma once`.

## Usage

1. Open a workspace in VS Code.
2. Run the command **Create Class Files** from the Command Palette (or press `Ctrl+Alt+C`).
3. Follow the prompts:
   - Enter your class name.
   - Enter a namespace (optional, e.g., "nebula::math").
   - Choose whether to place the files in the same folder or in separate folders.
   - If placing in separate folders, enter the header subfolder (default: "include") and the source subfolder (default: "src").
   - If placing in the same folder, specify the folder name (or leave empty for the workspace root).
4. The extension creates the appropriate header and source files with the specified options.

## License

[MIT](LICENSE)
