import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * S5: guest data never leaves the browser. Every module reachable from the
 * guest code (value imports, followed transitively) must be free of server
 * actions, server-only modules, the database and the auth session.
 */

const ROOT = path.resolve(__dirname, "../..");

const FORBIDDEN_PACKAGES = [
  "server-only",
  "next/headers",
  "next/cache",
  "drizzle-orm",
  "mysql2",
  "better-auth",
  "nodemailer",
];
const FORBIDDEN_FILES = [
  /^infrastructure\/db\//,
  /-service\.tsx?$/,
  /^modules\/auth\/infrastructure\//,
  /\/drizzle-[^/]+\.ts$/,
  /^app\/api\//,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__snapshots__" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Value imports and re-exports; `import type` / `export type` and all-type specifier lists are skipped. */
function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) {
    if (match[5]) {
      specifiers.push(match[5]);
      continue;
    }
    if (match[2]) continue;
    const clause = match[3];
    const braces = /^\{([\s\S]*)\}$/.exec(clause.trim());
    if (braces) {
      const names = braces[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((name) => name.startsWith("type "))) continue;
    }
    specifiers.push(match[4]);
  }
  return specifiers;
}

function resolveLocal(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
}

/** Every violation reachable from the entry files, as "chain: reason". */
function serverReach(entries: string[]): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  const queue = entries.map((file) => ({ file, chain: [path.relative(ROOT, file)] }));
  while (queue.length > 0) {
    const { file, chain } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const relative = path.relative(ROOT, file);
    const source = readFileSync(file, "utf8");
    if (/^\s*["']use server["']/.test(source)) violations.push(`${chain.join(" → ")}: "use server" module`);
    if (FORBIDDEN_FILES.some((rule) => rule.test(relative))) violations.push(`${chain.join(" → ")}: server module`);
    for (const specifier of valueImports(source)) {
      const local = resolveLocal(specifier, file);
      if (local) {
        queue.push({ file: local, chain: [...chain, path.relative(ROOT, local)] });
      } else if (FORBIDDEN_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
        violations.push(`${chain.join(" → ")}: imports ${specifier}`);
      }
    }
  }
  return violations;
}

describe("guest code stays in the browser", () => {
  it("reaches no server action, server-only module, database or session code", () => {
    const entries = [...sourceFiles(path.join(ROOT, "modules/guest")), ...sourceFiles(path.join(ROOT, "app/guest"))];
    expect(entries.length).toBeGreaterThan(10);
    expect(serverReach(entries)).toEqual([]);
  });

  it("detects a violation (the signed-in list reaches its server actions)", () => {
    const violations = serverReach([path.join(ROOT, "modules/exercises/ui/exercise-list.tsx")]);
    expect(violations).toContainEqual(expect.stringContaining('"use server" module'));
    expect(violations).toContainEqual(expect.stringContaining("exercise-service.ts: server module"));
    expect(violations).toContainEqual(expect.stringContaining("imports server-only"));
  });

  it("skips type-only imports", () => {
    expect(
      valueImports(
        'import type { A } from "./a";\nimport { type B, type C } from "./b";\nexport type { D } from "./d";\nimport { e, type F } from "./e";\nimport "./side";',
      ),
    ).toEqual(["./e", "./side"]);
  });
});
