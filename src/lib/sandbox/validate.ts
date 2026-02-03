import * as acorn from "acorn";

/** APIs that must never be called from sandboxed procedural code. */
const BLOCKED_IDENTIFIERS = new Set([
  "fetch",
  "XMLHttpRequest",
  "Worker",
  "eval",
  "Function",
  "import",
  "require",
  "globalThis",
  "window",
  "document",
  "self",
  "postMessage",
  "importScripts",
  "SharedArrayBuffer",
  "Atomics",
  "WebSocket",
  "EventSource",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "crypto",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
]);

/** Maximum nesting depth for AST nodes to prevent stack overflow attacks. */
const MAX_AST_DEPTH = 64;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Walk an AST tree, calling `visit` for each node.
 * Tracks depth to enforce the nesting limit.
 */
function walkAst(
  node: acorn.Node,
  visit: (node: acorn.Node, depth: number) => void,
  depth = 0,
): void {
  visit(node, depth);
  // Walk all child properties that are AST nodes or arrays of AST nodes
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    const val = (node as unknown as Record<string, unknown>)[key];
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && "type" in item) {
            walkAst(item as acorn.Node, visit, depth + 1);
          }
        }
      } else if ("type" in val) {
        walkAst(val as acorn.Node, visit, depth + 1);
      }
    }
  }
}

/**
 * Validate user-authored procedural code before execution in the Web Worker.
 *
 * Parses the code as a function body using acorn, then walks the AST to:
 * 1. Block dangerous global API access (fetch, eval, Worker, etc.)
 * 2. Enforce a maximum nesting depth to prevent stack-overflow attacks
 */
export function validateCode(code: string): ValidationResult {
  let ast: acorn.Node;
  try {
    // Parse as a script (the code is injected as a function body, not a module)
    ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: "script",
    });
  } catch (err) {
    return {
      valid: false,
      error: `Syntax error: ${err instanceof Error ? err.message : "parse failed"}`,
    };
  }

  // Walk the AST and check for violations
  let violation: string | null = null;

  walkAst(ast, (node, depth) => {
    if (violation) return; // stop on first violation

    // Depth check
    if (depth > MAX_AST_DEPTH) {
      violation = `Code exceeds maximum nesting depth of ${MAX_AST_DEPTH}`;
      return;
    }

    // Check Identifier nodes for blocked globals
    if (node.type === "Identifier") {
      const name = (node as acorn.Node & { name: string }).name;
      if (BLOCKED_IDENTIFIERS.has(name)) {
        violation = `Blocked API: "${name}" is not allowed in sandbox code`;
      }
    }

    // Check string literals for dynamic import patterns
    if (node.type === "Literal") {
      const value = (node as acorn.Node & { value: unknown }).value;
      if (typeof value === "string" && /^data:|^blob:|^https?:/.test(value)) {
        violation = `Blocked: URL literals are not allowed in sandbox code`;
      }
    }

    // Block import expressions (dynamic import())
    if (node.type === "ImportExpression") {
      violation = `Blocked: dynamic import() is not allowed in sandbox code`;
    }
  });

  if (violation) {
    return { valid: false, error: violation };
  }

  return { valid: true };
}
