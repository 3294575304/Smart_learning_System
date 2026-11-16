import type { SandboxExecutionRequest } from "./contract.js";

export type RuntimeLanguage = SandboxExecutionRequest["language"];

// Commands are fixed by the server. Source text and client parameters never
// become shell syntax. Compilation stays inside the same isolated container.
export const RUNTIMES: Record<
  RuntimeLanguage,
  {
    filename: string;
    image: string;
    entrypoint: string;
    args: string[];
    build: boolean;
  }
> = {
  PYTHON: {
    filename: "main.py",
    image: "zhixue-python-sandbox:3.10-v1",
    entrypoint: "python3",
    args: ["-I", "-B", "-S", "/workspace/main.py"],
    build: false,
  },
  C: {
    filename: "main.c",
    image: "zhixue-cpp-sandbox:11-v1",
    entrypoint: "/bin/sh",
    args: [
      "-c",
      "gcc -std=c17 -O2 -pipe /workspace/main.c -o /build/main -lm || { code=$?; case $code in 127|137|152) exit $code;; esac; echo COMPILATION_ERROR >&2; exit 65; }; exec /build/main",
    ],
    build: true,
  },
  CPP: {
    filename: "main.cpp",
    image: "zhixue-cpp-sandbox:11-v1",
    entrypoint: "/bin/sh",
    args: [
      "-c",
      "g++ -std=c++17 -O2 -pipe /workspace/main.cpp -o /build/main || { code=$?; case $code in 127|137|152) exit $code;; esac; echo COMPILATION_ERROR >&2; exit 65; }; exec /build/main",
    ],
    build: true,
  },
  JAVA: {
    filename: "Main.java",
    image: "zhixue-java-sandbox:17-v1",
    entrypoint: "/bin/sh",
    args: [
      "-c",
      "javac -J-XX:+UseSerialGC -J-Xmx64m -J-XX:MaxMetaspaceSize=64m -J-XX:ReservedCodeCacheSize=16m -J-Xss256k -J-XX:ActiveProcessorCount=1 -encoding UTF-8 -d /build /workspace/Main.java || { code=$?; case $code in 127|137|152) exit $code;; esac; echo COMPILATION_ERROR >&2; exit 65; }; exec java -XX:+UseSerialGC -Xmx64m -XX:MaxMetaspaceSize=64m -XX:ReservedCodeCacheSize=16m -Xss256k -XX:ActiveProcessorCount=1 -cp /build Main",
    ],
    build: true,
  },
  JAVASCRIPT: {
    filename: "main.js",
    image: "zhixue-javascript-sandbox:22-v1",
    entrypoint: "node",
    args: ["--max-old-space-size=64", "--v8-pool-size=1", "/workspace/main.js"],
    build: false,
  },
};
