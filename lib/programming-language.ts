import { z } from "zod";

export const PROGRAMMING_LANGUAGES = [
  "PYTHON",
  "C",
  "CPP",
  "JAVA",
  "JAVASCRIPT",
] as const;
export const programmingLanguageSchema = z.enum(PROGRAMMING_LANGUAGES);
export type ProgrammingLanguage = z.infer<typeof programmingLanguageSchema>;

export const LANGUAGE_DETAILS: Record<
  ProgrammingLanguage,
  { label: string; runtime: string; filename: string; starter: string }
> = {
  PYTHON: {
    label: "Python",
    runtime: "Python 3",
    filename: "main.py",
    starter: "# 在这里编写代码\n",
  },
  C: {
    label: "C",
    runtime: "GCC · C17",
    filename: "main.c",
    starter:
      "#include <stdio.h>\n\nint main(void) {\n    // 在这里编写代码\n    return 0;\n}\n",
  },
  CPP: {
    label: "C++",
    runtime: "G++ · C++17",
    filename: "main.cpp",
    starter:
      "#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里编写代码\n    return 0;\n}\n",
  },
  JAVA: {
    label: "Java",
    runtime: "OpenJDK 17",
    filename: "Main.java",
    starter:
      "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        // 在这里编写代码\n    }\n}\n",
  },
  JAVASCRIPT: {
    label: "JavaScript",
    runtime: "Node.js 22",
    filename: "main.js",
    starter:
      "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\n\n// 在这里编写代码\n",
  },
};

// Compilation and VM startup need a separate, bounded allowance. Python keeps
// the exact historical limits; no allowance exceeds the executor's hard caps.
export function programmingRuntimeLimits<
  T extends {
    cpuTimeMs: number;
    wallTimeMs: number;
    memoryBytes: number;
    processCount: number;
  },
>(language: ProgrammingLanguage, limits: T): T {
  if (language === "PYTHON") return limits;
  return {
    ...limits,
    cpuTimeMs: Math.max(limits.cpuTimeMs, 5_000),
    wallTimeMs: Math.max(limits.wallTimeMs, 10_000),
    memoryBytes: Math.max(limits.memoryBytes, 256 * 1024 * 1024),
    processCount: Math.max(limits.processCount, 32),
  };
}
