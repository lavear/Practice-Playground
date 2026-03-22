# Practice Playground

This project integrates an AI-powered inline code suggestion system (Ghost Text) directly into the Monaco Editor. It provides a Copilot-like experience with advanced features such as multi-language syntax highlighting within the suggestions, smart caching for partial acceptance, and predictive next-step generation.

## Features

* **Multi-Language Support & Detection:** Automatically detects the target language (Python, x86 Assembly, JavaScript, C++, Java, Bash, SQL, etc.) based on the user's prompt and adjusts comment syntax and highlighting rules accordingly.
* **Smart Context Caching:** If a user types characters that match the generated ghost text, the system smoothly consumes the text rather than making redundant API calls. The cache allows for seamless partial acceptance of suggestions.
* **Next-Step Generation:** Users can project the cursor to the end of the current suggestion and fetch the next logical chunk of code before accepting the first one.
* **Dynamic Syntax Highlighting:** Ghost text is rendered with custom HTML/CSS nodes to provide syntax highlighting that matches the editor's theme, including specific highlighting for Assembly registers and instructions.
* **Interactive Type Matching:** Ghost text actively updates and flags mismatches (strikethrough styling) if the user types something different than the suggested code.
* **Custom Keybindings & Help Modal:** Integrated keyboard shortcuts with a clean, built-in help UI.

## Prerequisites

This frontend implementation relies on a local backend API to generate the code suggestions. 

By default, the `fetchGhostText` function sends a `POST` request to `http://localhost:3000/suggest`. The backend should accept a JSON payload containing the `problem` description, `language`, current `code` context, and `mode`, and return a JSON object with a `ghost` string property.

## Usage / Keyboard Shortcuts

The editor includes several built-in keybindings for managing the AI suggestions:

| Command | Shortcut | Description |
| :--- | :--- | :--- |
| **Trigger / Restore** | `Ctrl + Space` | Fetches a new suggestion or restores a hidden one from the cache. |
| **Next Step** | `Ctrl + Down Arrow` | Fetches the next logical block of code and appends it to the current suggestion. |
| **Accept** | `Tab` | Inserts the current ghost text into the editor at the cursor position. |
| **Dismiss** | `Esc` | Hides the ghost text or closes the help menu. |
| **Help Menu** | `Ctrl + Shift + H` | Toggles the keyboard shortcut reference modal. |

## Architecture Details

* **InlineGhost Class:** Manages the rendering lifecycle of the ghost text. It calculates line heights, handles indentation, creates absolutely positioned DOM nodes over the editor, and manages the cursor's logical position.
* **Overlap Removal:** The `removeOverlap` function ensures that the backend response does not duplicate the text already present on the current line.
* **Prompt Injection:** The system automatically injects a hidden system prompt instructing the AI to provide step-by-step instructions formatted as native code comments for the specific target language.

## Setup

1. Include the Monaco Editor script via your preferred CDN (currently using `unpkg`).
2. Include `main.js` in your project.
3. Ensure you have an HTML container with the id `editor` and an element with the id `question-display` for the context prompt.
4. Run your backend suggestion server on port 3000.
