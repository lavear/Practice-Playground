require.config({
  paths: {
    vs: "https://unpkg.com/monaco-editor@0.45.0/min/vs"
  }
});

require(["vs/editor/editor.main"], function () {

  // --- 0. DYNAMIC LANGUAGE DETECTION LOGIC ---
  const QUESTION_TEXT = "Implement a neural network from scratch in python"; 

  function detectLanguageFromQuestion(question) {
    const q = question.toLowerCase();
    
    // 1. Python & ML
    if (q.includes("python") || q.includes("pandas") || q.includes("numpy") || q.includes("matplotlib") || q.includes("neural") || q.includes("regression") || q.includes("ml") || q.includes("ai")) {
        return "python";
    }
    
    // 2. C++ & DSA
    if (q.includes("c++") || q.includes("cpp") || q.includes("dsa") || q.includes("stl") || q.includes("vector") || q.includes("struct")) {
        return "cpp";
    }

    // 3. Bash / Shell
    if (q.includes("bash") || q.includes("shell") || q.includes("sh") || q.includes("script") || q.includes("terminal")) {
        return "shell";
    }

    // 4. Assembly (Fallback to 'ini' for highlighting)
    if (q.includes("assembly") || q.includes("asm") || q.includes("x86") || q.includes("nasm") || q.includes("registers")) {
        return "ini"; 
    }

    // 5. JavaScript / Web
    if (q.includes("javascript") || q.includes("js") || q.includes("node") || q.includes("react")) {
        return "javascript";
    }

    // 6. Verilog / FPGA (NEW)
    if (q.includes("verilog") || q.includes("hdl") || q.includes("fpga") || q.includes("systemverilog") || q.includes("module") || q.includes("wire") || q.includes("reg")) {
        return "verilog";
    }

    return "python"; // Default fallback
  }

  const detectedLang = detectLanguageFromQuestion(QUESTION_TEXT);

  // --- 1. EDITOR CONFIGURATION ---
  const editor = monaco.editor.create(
    document.getElementById("editor"),
    {
      value: "",
      language: detectedLang, 
      theme: "vs-dark",
      fontSize: 17, 
      lineHeight: 26,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 20, bottom: 20 },
      automaticLayout: true,
      autoClosingBrackets: "never",
      autoClosingQuotes: "never",
      autoSurround: "never",
      fontFamily: "'Roboto Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      fontLigatures: true,
      cursorBlinking: "phase", 
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true
    }
  );

  const model = editor.getModel();
  const tabSize = editor.getOption(monaco.editor.EditorOption.tabSize) || 4;

  // --- 2. QUESTION STREAMING LOGIC ---
  function streamQuestion() {
      const display = document.getElementById("question-display");
      if (!display) return;
      
      let i = 0;
      const speed = 30; 

      function type() {
          if (i < QUESTION_TEXT.length) {
              display.textContent += QUESTION_TEXT.charAt(i);
              i++;
              // Cursor Logic
              let cursor = document.getElementById("cursor-caret");
              if(!cursor) {
                  cursor = document.createElement("span");
                  cursor.id = "cursor-caret";
                  cursor.className = "cursor";
                  display.appendChild(cursor);
              } else {
                  display.appendChild(cursor);
              }
              setTimeout(type, speed);
          }
      }
      setTimeout(type, 500);
  }

  streamQuestion();

  // --- 3. CACHE STORE ---
  let activeCache = {
      originCode: null,   
      fullGhostText: null 
  };

  // --- 4. INLINE GHOST CLASS ---
  class InlineGhost {
    constructor(editor) {
      this.editor = editor;
      this.lines = [];
      this.lineIndex = 0;
      this.colConsumed = 0;
      this.isMismatch = false;
      this.anchorPosition = null;
      this.lockedPosition = null;
      this.nodes = [];
      this.indentText = "";
      
      const fontInfo = editor.getOption(monaco.editor.EditorOption.fontInfo);
      this.fontInfo = fontInfo;
      this.charWidth = fontInfo.typicalHalfwidthCharacterWidth;
      this.lineHeight = fontInfo.lineHeight;
    }

    // --- NEW: Context Aware Comment Detection ---
    getCommentChar() {
        const lang = this.editor.getModel().getLanguageId();
        
        // C-Style (C++, Java, JS, Verilog, etc.)
        if (['cpp', 'c', 'java', 'javascript', 'typescript', 'csharp', 'go', 'rust', 'verilog', 'systemverilog'].includes(lang)) {
            return '//';
        }
        // Hash-Style (Python, Shell, YAML)
        if (['python', 'shell', 'yaml', 'ruby', 'perl'].includes(lang)) {
            return '#';
        }
        // Semicolon-Style (Assembly, Ini)
        if (['ini', 'asm', 'clojure'].includes(lang)) {
            return ';';
        }
        return '//'; // Default
    }

    stripComment(text) {
        if (!text) return "";
        const trimmed = text.trim();
        const commentChar = this.getCommentChar();

        // STRICT CHECK: Only strip if it matches the CURRENT language's comment char
        if (trimmed.startsWith(commentChar)) return "";
        
        // Inline stripping (pad with space to avoid stripping URLs or #include)
        if (text.includes(` ${commentChar} `)) {
            return text.split(` ${commentChar} `)[0];
        }
        
        // Special Case: Handle [INSTRUCTION] if it appears without spaces
        if (text.includes(`${commentChar} [INSTRUCTION]`)) {
             return text.split(`${commentChar} [INSTRUCTION]`)[0];
        }

        return text; 
    }

    createNode() {
      const node = document.createElement("div");
      node.className = "ghost-text";
      node.style.position = "absolute";
      node.style.pointerEvents = "none";
      node.style.whiteSpace = "pre";
      node.style.fontFamily = this.fontInfo.fontFamily;
      node.style.fontSize = `${this.fontInfo.fontSize}px`;
      node.style.lineHeight = `${this.fontInfo.lineHeight}px`;
      node.style.zIndex = "10"; 
      this.editor.getDomNode().appendChild(node);
      return node;
    }

    computeIndent() {
      const lineText = model.getLineContent(this.lockedPosition.lineNumber);
      const leading = lineText.match(/^\s*/)?.[0] ?? "";
      const trimmed = lineText.trimEnd();
      const needsBlockIndent = trimmed.endsWith(":") || trimmed.endsWith("{") || (this.editor.getModel().getLanguageId() === 'verilog' && (trimmed.endsWith("begin") || trimmed.endsWith("module") || trimmed.endsWith("case")));
      this.indentText = leading + (needsBlockIndent ? " ".repeat(tabSize) : "");
    }

    ensureLinesExist(count) {
      const insertAt = this.lockedPosition.lineNumber;
      const needed = count - 1;
      if (needed <= 0) return;
      model.applyEdits([{
          range: new monaco.Range(insertAt, model.getLineMaxColumn(insertAt), insertAt, model.getLineMaxColumn(insertAt)),
          text: "\n".repeat(needed),
          forceMoveMarkers: true
      }]);
    }

    append(newText) {
       if (!newText) return;
       const newLines = newText.replace(/\r/g, "").split("\n");
       this.lines = this.lines.concat(newLines);
       this.ensureLinesExist(this.lines.length);
       newLines.forEach(() => this.nodes.push(this.createNode()));
       this.updatePosition();
    }

    show(text) {
      this.hide(false); 
      this.lines = text.replace(/\r/g, "").split("\n");
      this.lineIndex = 0;
      this.colConsumed = 0;
      this.isMismatch = false;
      this.lockedPosition = this.editor.getPosition();
      this.anchorPosition = this.lockedPosition;
      this.computeIndent();
      this.ensureLinesExist(this.lines.length);
      this.editor.setPosition(this.lockedPosition);
      this.editor.focus();
      this.lines.forEach(() => this.nodes.push(this.createNode()));
      this.updatePosition();
      window.ghostEnabled = true;
    }

    hide(restoreCaret = true) {
      this.nodes.forEach(n => n.remove());
      this.nodes = [];
      this.lines = [];
      this.lineIndex = 0;
      this.colConsumed = 0;
      this.isMismatch = false;
      this.anchorPosition = null;
      this.lockedPosition = null;
      this.indentText = "";
      window.ghostEnabled = false;
    }

    accept() {
      if (!this.anchorPosition) return;
      const rawRemainingLines = this.lines.slice(this.lineIndex);
      const cleanLines = rawRemainingLines.map(line => this.stripComment(line) || line);
      const fullCleanText = cleanLines.join("\n");
      const textToInsert = fullCleanText.slice(this.colConsumed);

      if (textToInsert) {
        this.editor.trigger('keyboard', 'type', { text: textToInsert });
        activeCache = { originCode: null, fullGhostText: null };
      }
      this.hide();
    }

    // --- SYNTAX HIGHLIGHTER ---
    highlightCode(code) {
        const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        let html = esc(code);

        // Strings
        html = html.replace(/("[^"]*"|'[^']*')/g, '<span class="ghost-string">$1</span>');

        // Keywords
        const keywords = [
            // Python
            "def", "class", "return", "import", "from", "if", "else", "elif", "for", "while", "try", "except", "with", "as", "pass", "lambda", "is", "in", "not", "and", "or", "None", "True", "False",
            // C++ / Java / JS
            "public", "private", "protected", "void", "int", "char", "float", "double", "bool", "long", "const", "static", "new", "delete", "function", "var", "let", "await", "async", "std", "cout", "cin", "vector", "string", "namespace", "using", "struct", "template", 
            // Bash
            "echo", "fi", "then", "case", "esac", "do", "done", "local", "export", "read",
            // Assembly
            "mov", "push", "pop", "lea", "sub", "add", "inc", "dec", "cmp", "jmp", "je", "jne", "jg", "jl", "call", "ret", "nop", "xor", "imul", "div", "syscall", "section", "global", "extern", "db", "dw", "dd", "len", "equ", "msg", "_start",
            // Verilog (NEW)
            "module", "endmodule", "input", "output", "wire", "reg", "always", "begin", "end", "posedge", "negedge", "assign", "parameter", "initial", "always_ff", "always_comb", "default", "generate", "endgenerate"
        ];
        
        keywords.forEach(kw => {
            const regex = new RegExp(`(\\b${kw}\\b)(?![^<]*>)`, 'gi');
            html = html.replace(regex, `<span class="ghost-keyword">$1</span>`); 
        });

        // Highlight C++ Preprocessor Directives (#include, #define) specifically
        html = html.replace(/(^|\s)(#\w+)/g, '$1<span class="ghost-keyword">$2</span>');

        // Highlight Verilog System Tasks (e.g., $display, $monitor)
        html = html.replace(/(\$[a-zA-Z0-9_]+)/g, '<span class="ghost-function">$1</span>');

        // Highlight Functions
        html = html.replace(/(\w+)(?=\()/g, '<span class="ghost-function">$1</span>');
        
        // Highlight Numbers
        html = html.replace(/\b(0x[0-9a-fA-F]+|\d+)\b(?![^<]*>) /g, '<span class="ghost-number">$1</span>');
        
        // Highlight Registers
        const registers = ["eax", "ebx", "ecx", "edx", "esi", "edi", "esp", "ebp", "rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rsp", "rbp", "al", "ah", "bl", "bh"];
        registers.forEach(reg => {
            const regex = new RegExp(`(\\b${reg}\\b)(?![^<]*>)`, 'gi');
            html = html.replace(regex, `<span class="ghost-variable">$1</span>`);
        });

        return html;
    }

    updatePosition() {
      if (!this.anchorPosition) return;
      const cursorPosition = this.editor.getPosition();
      const cursorCoords = this.editor.getScrolledVisiblePosition(cursorPosition);
      const startOfLine = this.editor.getScrolledVisiblePosition({
        lineNumber: this.anchorPosition.lineNumber + this.lineIndex,
        column: 1
      });

      if (!cursorCoords || !startOfLine) return;

      this.nodes.forEach((node, i) => {
        if (i < this.lineIndex) {
          node.textContent = "";
          return;
        }

        const fullLineText = this.lines[i] ?? "";
        const visibleText = i === this.lineIndex ? fullLineText.slice(this.colConsumed) : fullLineText;
        const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        if (this.isMismatch) {
            node.style.color = "#ff3333"; 
            node.style.textDecoration = "line-through";
            node.style.opacity = "0.9";
            node.textContent = visibleText;
        } else {
            node.style.textDecoration = "none";
            node.style.opacity = "1.0";
            
            // --- FIX: Dynamic Comment Detection for Rendering ---
            const commentChar = this.getCommentChar();

            // 1. Check for [INSTRUCTION] tag
            if (visibleText.includes("[INSTRUCTION]")) {
                let parts;
                
                // Try to find the comment char. 
                // We search for ` ${commentChar}` to be safe, or just `commentChar` if checking loose.
                if (visibleText.includes(commentChar)) {
                    // Split carefully to keep the instruction visible
                    const splitIdx = visibleText.indexOf(commentChar);
                    const codePart = visibleText.substring(0, splitIdx);
                    const instructionPart = visibleText.substring(splitIdx);
                    
                    node.innerHTML = this.highlightCode(codePart) + `<span class="ghost-instruction">${esc(instructionPart)}</span>`;
                } else {
                    // Fallback: entire line is instruction
                    node.innerHTML = `<span class="ghost-instruction">${esc(visibleText)}</span>`;
                }
            } 
            // 2. Check for Normal Comments
            else if (visibleText.includes(` ${commentChar}`)) {
                const index = visibleText.indexOf(` ${commentChar}`);
                const codePart = visibleText.substring(0, index);
                const commentPart = visibleText.substring(index);
                node.innerHTML = this.highlightCode(codePart) + `<span class="ghost-comment">${esc(commentPart)}</span>`;
            } 
            else {
                node.innerHTML = this.highlightCode(visibleText);
            }
        }

        const topOffset = (i - this.lineIndex) * this.lineHeight;
        node.style.top = `${cursorCoords.top + topOffset}px`;

        if (i === this.lineIndex) {
           node.style.left = `${cursorCoords.left}px`;
        } else {
           const left = startOfLine.left; 
           node.style.left = `${left}px`;
        }
      });
    }

    onType() {
      if (!this.lines.length) return;
      const pos = this.editor.getPosition();
      const expectedLine = this.lockedPosition.lineNumber + this.lineIndex;

      if (pos.lineNumber > expectedLine) {
        this.lineIndex++;
        this.colConsumed = 0;
        this.isMismatch = false; 
        this.updatePosition();
        return;
      }

      const lineText = model.getLineContent(pos.lineNumber);
      const baseColumn = this.lineIndex === 0 ? this.lockedPosition.column - 1 : 0;
      const typed = lineText.slice(baseColumn, pos.column - 1);
      const ghostLine = this.lines[this.lineIndex] ?? "";
      
      const codePart = this.stripComment(ghostLine);

      if (codePart === "" && typed.length > 0) {
          this.isMismatch = true;
      } else {
          let i = 0;
          while (i < typed.length && i < codePart.length && typed[i] === codePart[i]) {
            i++;
          }
          this.colConsumed = i;
          this.isMismatch = typed.length > i;
      }
      this.updatePosition();
    }
  }

  const ghost = new InlineGhost(editor);
  window.ghostEnabled = false;

  // --- 5. HELPER FUNCTIONS ---

  function sliceCodeUpToCursor(text, cursor) {
    const lines = text.split('\n');
    const limitLineIndex = cursor.lineNumber - 1; 
    
    if (limitLineIndex < 0) return "";
    if (limitLineIndex >= lines.length) return text;
    
    const preLines = lines.slice(0, limitLineIndex);
    const currentLine = lines[limitLineIndex];
    const preCurrentLine = currentLine.slice(0, cursor.column - 1);
    
    preLines.push(preCurrentLine);
    return preLines.join('\n');
  }

  function removeOverlap(inputCode, ghostText) {
      if (!ghostText) return "";
      const inputLines = inputCode.split('\n');
      const lastInputLine = inputLines[inputLines.length - 1]; 
      
      if (lastInputLine.length > 0 && ghostText.startsWith(lastInputLine)) {
          return ghostText.slice(lastInputLine.length);
      }
      const lastTrimmed = lastInputLine.trim();
      if (lastTrimmed.length > 3) {
          const matchIndex = ghostText.indexOf(lastTrimmed);
          if (matchIndex >= 0 && matchIndex < lastInputLine.length + 5) {
               return ghostText.slice(matchIndex + lastTrimmed.length);
          }
      }
      return ghostText;
  }

  async function fetchGhostText(currentCode, currentCursor, mode) {
      const problemDisplay = document.getElementById("question-display");
      const currentProblemText = problemDisplay ? problemDisplay.innerText : QUESTION_TEXT;
      
      const codeContext = sliceCodeUpToCursor(currentCode, currentCursor);
      const detectedLang = detectLanguageFromQuestion(currentProblemText); 
      
      // Update editor syntax highlighting (Visual)
      if (editor.getModel().getLanguageId() !== detectedLang) {
          monaco.editor.setModelLanguage(editor.getModel(), detectedLang);
      }

      // Map to Verbose Language Name for AI (Prompt)
      let apiLang = detectedLang;
      if (detectedLang === "ini") apiLang = "x86 Assembly";
      if (detectedLang === "shell") apiLang = "Bash Script";
      if (detectedLang === "python") apiLang = "Python";
      if (detectedLang === "cpp") apiLang = "C++";
      if (detectedLang === "verilog") apiLang = "Verilog";

      try {
        const res = await fetch("http://localhost:3000/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problem: currentProblemText, 
            language: apiLang, 
            code: codeContext,
            mode: mode 
          })
        });
        const data = await res.json();
        let rawGhost = data.ghost || "";

        if (!rawGhost) return null;

        const cleanGhost = removeOverlap(codeContext, rawGhost);
        return cleanGhost ? cleanGhost : null;
      } catch (e) {
        return null;
      }
  }

  // --- 6. CORE ACTIONS ---
  async function generateSingleBlock() {
    if (window.ghostEnabled) {
      ghost.hide(true);
      return;
    }

    const currentPos = editor.getPosition();
    const fullCurrentCode = editor.getValue();
    const currentContext = sliceCodeUpToCursor(fullCurrentCode, currentPos);

    if (activeCache.originCode && activeCache.fullGhostText) {
          const normalize = (s) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          const cleanContext = normalize(currentContext);
          const cleanOrigin = normalize(activeCache.originCode);
          const cleanGhost = normalize(activeCache.fullGhostText);
          
          if (cleanContext === cleanOrigin) {
              ghost.show(activeCache.fullGhostText);
              return;
          }
          if (cleanContext.startsWith(cleanOrigin)) {
              const userProgress = cleanContext.slice(cleanOrigin.length);
              if (cleanGhost.startsWith(userProgress)) {
                  const remainingGhost = activeCache.fullGhostText.slice(userProgress.length);
                  if (remainingGhost.length > 0) {
                      ghost.show(remainingGhost);
                      return;
                  }
              }
          }
    }

    activeCache = { originCode: null, fullGhostText: null }; 

    const text = await fetchGhostText(editor.getValue(), editor.getPosition(), 'chunk');
    
    if (text) {
       activeCache = { originCode: currentContext, fullGhostText: text };
       ghost.show(text);
    }
  }

  async function triggerNextStep() {
    const currentGhostLines = window.ghostEnabled ? [...ghost.lines] : [];
    
    let combinedCode = editor.getValue();
    if (currentGhostLines.length > 0) {
        combinedCode += "\n" + currentGhostLines.join("\n");
    }

    const lines = combinedCode.split("\n");
    const projectedCursor = { 
        lineNumber: lines.length, 
        column: lines[lines.length - 1].length + 1 
    };

    const newStepText = await fetchGhostText(combinedCode, projectedCursor, 'step');
    
    if (newStepText) {
        let finalGhostText = "";
        
        if (currentGhostLines.length > 0) {
            finalGhostText = currentGhostLines.join("\n") + "\n" + newStepText;
        } else {
            finalGhostText = newStepText;
        }

        const currentPos = editor.getPosition();
        const currentContext = sliceCodeUpToCursor(editor.getValue(), currentPos);
        activeCache = { originCode: currentContext, fullGhostText: finalGhostText };

        ghost.show(finalGhostText);
    }
  }

  // --- 7. KEYBINDINGS ---
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, generateSingleBlock);
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.DownArrow, triggerNextStep);

  editor.addCommand(monaco.KeyCode.Tab, function () {
    if (window.ghostEnabled && ghost.anchorPosition) {
      ghost.accept();
    } else {
      editor.trigger('keyboard', 'tab', null);
    }
  });

  editor.addCommand(monaco.KeyCode.Escape, function () {
    const modal = document.getElementById("help-modal");
    if (modal && modal.style.display === "block") {
        modal.style.display = "none";
        return;
    }
    if (window.ghostEnabled && ghost.anchorPosition) {
      ghost.hide();
      window.ghostEnabled = false;
    }
  });

  editor.onDidChangeModelContent((e) => {
    if (window.ghostEnabled && ghost.anchorPosition && !e.isFlush) {
       ghost.onType();
    }
  });

  editor.onDidScrollChange(() => {
    if (window.ghostEnabled) ghost.updatePosition();
  });

  // --- 8. HELP FEATURE ---
  const helpModal = document.createElement('div');
  helpModal.id = "help-modal";
  helpModal.style.position = "fixed";
  helpModal.style.top = "50%";
  helpModal.style.left = "50%";
  helpModal.style.transform = "translate(-50%, -50%)";
  helpModal.style.width = "500px";
  helpModal.style.backgroundColor = "#1e1e1e";
  helpModal.style.border = "1px solid #444";
  helpModal.style.borderRadius = "8px";
  helpModal.style.boxShadow = "0 8px 32px rgba(0,0,0,0.5)";
  helpModal.style.color = "#d4d4d4";
  helpModal.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  helpModal.style.zIndex = "9999";
  helpModal.style.padding = "20px";
  helpModal.style.display = "none";

  const helpTitle = document.createElement("h2");
  helpTitle.innerText = "Keyboard Shortcuts";
  helpTitle.style.marginTop = "0";
  helpTitle.style.marginBottom = "20px";
  helpTitle.style.fontSize = "18px";
  helpTitle.style.borderBottom = "1px solid #333";
  helpTitle.style.paddingBottom = "10px";
  helpModal.appendChild(helpTitle);

  const hotkeys = [
      { keys: "Ctrl + Space", desc: "Trigger / Toggle Suggestion" },
      { keys: "Ctrl + Down Arrow", desc: "Fetch Next Logic Step" },
      { keys: "Tab", desc: "Accept Suggestion" },
      { keys: "Esc", desc: "Dismiss Suggestion / Close Help" },
      { keys: "Ctrl + Shift + H", desc: "Toggle This Help Menu" }
  ];

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  hotkeys.forEach(hk => {
      const row = document.createElement("tr");
      const keyCell = document.createElement("td");
      keyCell.style.padding = "8px 0";
      keyCell.style.fontWeight = "bold";
      keyCell.style.color = "#ff5e00";
      keyCell.innerText = hk.keys;
      const descCell = document.createElement("td");
      descCell.style.padding = "8px 0";
      descCell.style.textAlign = "right";
      descCell.style.color = "#cccccc";
      descCell.innerText = hk.desc;
      row.appendChild(keyCell);
      row.appendChild(descCell);
      table.appendChild(row);
  });
  
  helpModal.appendChild(table);
  document.body.appendChild(helpModal);

  function toggleHelp() {
      if (helpModal.style.display === "none") {
          helpModal.style.display = "block";
      } else {
          helpModal.style.display = "none";
      }
  }

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH, toggleHelp);
});