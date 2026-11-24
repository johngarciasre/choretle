/**
 * Static inventory of API routes and the calls client code makes to them.
 * Shared by the contract test and the route smoke test.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

export interface Route {
  segments: string[];
  methods: Set<string>;
  file: string;
}

export interface Call {
  segments: string[];
  method: string;
  file: string;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

export function routeTable(): Route[] {
  const apiRoot = path.join(SRC, "app", "api");
  return walk(apiRoot)
    .filter((file) => file.endsWith(`${path.sep}route.ts`))
    .map((file) => {
      const segments = path.relative(apiRoot, file).split(path.sep).slice(0, -1);
      const text = fs.readFileSync(file, "utf8");
      const methods = new Set<string>();
      for (const match of text.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
        methods.add(match[1]);
      }
      return { segments, methods, file: path.relative(SRC, file) };
    });
}

export function clientCalls(): Call[] {
  const roots = [path.join(SRC, "app"), path.join(SRC, "components"), path.join(SRC, "hooks")];
  const files = roots
    .flatMap((root) => walk(root))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !file.includes(`${path.sep}api${path.sep}`));

  const calls: Call[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const starts = [...text.matchAll(/fetch\(/g)].map((m) => m.index!);
    starts.forEach((start, i) => {
      // Bound the call at the next fetch( so a later method: cannot leak in.
      const slice = text.slice(start, starts[i + 1] ?? text.length);
      const urlMatch = slice.match(/fetch\(\s*[`"'](\/api\/[^`"']+)/);
      if (!urlMatch) return;
      const methodMatch = slice.match(/method:\s*["'`](\w+)["'`]/);
      calls.push({
        segments: urlMatch[1].split("?")[0].split("/").filter(Boolean).slice(1),
        method: (methodMatch?.[1] || "GET").toUpperCase(),
        file: path.relative(SRC, file),
      });
    });
  }
  return calls;
}

const isPlaceholder = (segment: string) => segment.startsWith("${") || /^\[.+\]$/.test(segment);

export function resolveRoute(call: Call, routes: Route[]): Route | undefined {
  return routes.find((route) => {
    if (route.segments.length !== call.segments.length) return false;
    return route.segments.every((segment, i) => {
      const called = call.segments[i];
      if (isPlaceholder(segment) || isPlaceholder(called)) {
        return isPlaceholder(segment) && isPlaceholder(called);
      }
      return segment === called;
    });
  });
}

/** `/api/jobs/${jobId}` -> `jobs/missing-id` so a handler can be invoked. */
export function concretePath(call: Call): string {
  return `/api/${call.segments.map((s) => (isPlaceholder(s) ? "missing-id" : s)).join("/")}`;
}
