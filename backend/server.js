import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}

// HELPER: Get correct comment syntax and Prompt Context based on language
const getLanguageConfig = (lang) => {
  const l = lang.toLowerCase();
  
  // 1. Assembly
  if (l.includes("assembly") || l.includes("asm") || l.includes("nasm")) {
    return { 
        name: "x86 Assembly (NASM Syntax)", 
        comment: ";",
        extra: "Strictly use standard NASM syntax (section .data, section .text, global _start). Do NOT generate project configuration files."
    };
  }
  
  // 2. Python (ML/General)
  if (l.includes("python")) {
    return { 
        name: "Python", 
        comment: "#",
        extra: "Use standard Python conventions (PEP 8). For ML/Data Science, prefer standard libraries like numpy, pandas, or pytorch if applicable."
    };
  }
  
  // 3. Bash/Shell
  if (l.includes("bash") || l.includes("shell") || l.includes("sh")) {
    return { 
        name: "Bash Script", 
        comment: "#",
        extra: "Ensure the code is valid POSIX or Bash scripting. Start with shebang if this is a new file."
    };
  }
  
  // 4. C++ (DSA/Systems)
  if (l.includes("c++") || l.includes("cpp")) {
    return { 
        name: "C++", 
        comment: "//",
        extra: "Use modern C++ standards (C++17/20). For DSA, use the Standard Template Library (STL) efficiently."
    };
  }

  // 5. JavaScript/Web
  if (l.includes("javascript") || l.includes("js")) {
    return { name: "JavaScript", comment: "//", extra: "" };
  }
  
  // Default
  return { name: lang, comment: "#", extra: "" }; 
};

app.post("/suggest", async (req, res) => {
  try {
    const { problem, code, language, mode } = req.body; 

    // LOG: Debugging
    console.log(`\n--- 📨 REQUEST: [${language}] for "${problem.substring(0, 30)}..." ---`);

    const isFullCode = mode === "full";
    const langConfig = getLanguageConfig(language);
    const C = langConfig.comment;

    const prompt = `
You are an expert "Code Completion Engine".
The user is working on a task in **${langConfig.name}**.
The "INPUT CODE" below is the file content **EXACTLY UP TO THE CURSOR**.

YOUR JOB:
${isFullCode 
  ? "Generate the REMAINING code from the cursor position to the end of the file." 
  : "Generate ONLY the immediate next logical chunk (4-8 lines)."}

GUIDELINES:
1. **LANGUAGE:** Write strictly in ${langConfig.name}.
2. **CONTEXT:** ${langConfig.extra}
3. **NO REPETITION:** Do NOT output code that is already in "INPUT CODE".
4. **CONTINUITY:** Append validly to the last character of the input.
5. **COMMENTING:** Append a comment " ${C} " to lines explaining complex logic.
6. **INSTRUCTION:** At the very end, add a line starting with "${C} [INSTRUCTION]: " giving a short next-step tip.
7. **FORMAT:** Raw text only. No Markdown blocks.

CONTEXT:
Problem: ${problem}

INPUT CODE (Ends at cursor):
${code || ""}

COMPLETION (Start immediately after the last character above):
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
        console.error(`❌ API Error: ${response.status}`);
        return res.json({ ghost: "" });
    }

    const data = await response.json();
    let ghost = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Clean up
    ghost = ghost.replace(/^```[a-z]*\n/i, "").replace(/```$/g, "").trimEnd();

    console.log(`✅ Generated ${ghost.length} chars`);
    res.json({ ghost });
  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.json({ ghost: "" });
  }
});

app.listen(3000, () => {
  console.log("✅ Gemini backend running on http://localhost:3000");
});