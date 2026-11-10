/**
 * Desk depends_on without eval(). Show the field when the expression
 * cannot be parsed — hiding an ERPNext field is worse than showing it.
 */

function truthy(value: unknown): boolean {
  if (value == null || value === false || value === 0 || value === "0" || value === "") return false;
  return true;
}

function lookup(doc: Record<string, unknown>, path: string): unknown {
  if (path.startsWith("doc.")) return doc[path.slice(4)];
  if (path.startsWith("parent.")) return doc[path.slice(7)];
  return doc[path];
}

type Tok =
  | { k: "op"; v: string }
  | { k: "id"; v: string }
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "(" }
  | { k: ")" }
  | { k: "[" }
  | { k: "]" }
  | { k: "," }
  | { k: "." };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i += 1; continue; }
    if (c === "(") { out.push({ k: "(" }); i += 1; continue; }
    if (c === ")") { out.push({ k: ")" }); i += 1; continue; }
    if (c === "[") { out.push({ k: "[" }); i += 1; continue; }
    if (c === "]") { out.push({ k: "]" }); i += 1; continue; }
    if (c === ",") { out.push({ k: "," }); i += 1; continue; }
    if (c === "." && !/[0-9]/.test(src[i + 1] || "")) { out.push({ k: "." }); i += 1; continue; }
    if (c === "'" || c === '"') {
      const q = c;
      i += 1;
      let s = "";
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") { s += src[i + 1] ?? ""; i += 2; continue; }
        s += src[i];
        i += 1;
      }
      i += 1;
      out.push({ k: "str", v: s });
      continue;
    }
    if (src.startsWith("===", i) || src.startsWith("!==", i)) { out.push({ k: "op", v: src.slice(i, i + 3) }); i += 3; continue; }
    if (src.startsWith("==", i) || src.startsWith("!=", i) || src.startsWith("<=", i) || src.startsWith(">=", i) || src.startsWith("&&", i) || src.startsWith("||", i)) {
      out.push({ k: "op", v: src.slice(i, i + 2) }); i += 2; continue;
    }
    if (c === "!" || c === "<" || c === ">") { out.push({ k: "op", v: c }); i += 1; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      const m = src.slice(i).match(/^[0-9]*\.?[0-9]+/);
      if (!m) throw new Error("num");
      out.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!m) throw new Error("id");
      out.push({ k: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    throw new Error(`tok ${c}`);
  }
  return out;
}

class Parser {
  i = 0;
  constructor(readonly toks: Tok[], readonly doc: Record<string, unknown>) {}

  peek(): Tok | undefined { return this.toks[this.i]; }
  eat(): Tok {
    const t = this.toks[this.i];
    if (!t) throw new Error("eof");
    this.i += 1;
    return t;
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.k === "op" && t.v === v;
  }

  parse(): unknown {
    const v = this.or();
    if (this.peek()) throw new Error("trail");
    return v;
  }

  or(): unknown {
    let left = this.and();
    while (this.isOp("||")) { this.eat(); left = truthy(left) || truthy(this.and()); }
    return left;
  }

  and(): unknown {
    let left = this.cmp();
    while (this.isOp("&&")) { this.eat(); left = truthy(left) && truthy(this.cmp()); }
    return left;
  }

  cmp(): unknown {
    const left = this.unary();
    const t = this.peek();
    if (!t || t.k !== "op" || !["==", "===", "!=", "!==", "<", ">", "<=", ">="].includes(t.v)) return left;
    this.eat();
    const right = this.unary();
    const op = t.v;
    if (op === "==" || op === "===") return eq(left, right);
    if (op === "!=" || op === "!==") return !eq(left, right);
    const a = Number(left);
    const b = Number(right);
    if (op === "<") return a < b;
    if (op === ">") return a > b;
    if (op === "<=") return a <= b;
    return a >= b;
  }

  unary(): unknown {
    if (this.isOp("!")) { this.eat(); return !truthy(this.unary()); }
    return this.primary();
  }

  primary(): unknown {
    const t = this.eat();
    if (t.k === "num") return t.v;
    if (t.k === "str") return t.v;
    if (t.k === "(") {
      const v = this.or();
      const close = this.eat();
      if (close.k !== ")") throw new Error(")");
      return v;
    }
    if (t.k === "id") {
      if (t.v === "True" || t.v === "true") return true;
      if (t.v === "False" || t.v === "false") return false;
      if (t.v === "None" || t.v === "null") return null;
      if (t.v === "cint" || t.v === "int" || t.v === "flt") {
        this.expect("(");
        const inner = this.or();
        this.expect(")");
        const n = Number(inner);
        return t.v === "flt" ? n : Math.trunc(n || 0);
      }
      if (t.v === "in_list") {
        this.expect("(");
        const list = this.list();
        this.expect(",");
        const val = this.or();
        this.expect(")");
        return list.some((x) => eq(x, val));
      }
      if (t.v === "doc" || t.v === "parent") {
        this.expect(".");
        const field = this.eat();
        if (field.k !== "id") throw new Error("field");
        return this.doc[field.v];
      }
      return this.doc[t.v];
    }
    throw new Error("primary");
  }

  list(): unknown[] {
    this.expect("[");
    const out: unknown[] = [];
    if (this.peek()?.k === "]") { this.eat(); return out; }
    out.push(this.or());
    while (this.peek()?.k === ",") { this.eat(); out.push(this.or()); }
    this.expect("]");
    return out;
  }

  expect(k: Tok["k"] | ","): void {
    const t = this.eat();
    if (k === "," ? t.k !== "," : t.k !== k) throw new Error(String(k));
  }
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && (b === "" || b === 0 || b === false)) return true;
  if (b == null && (a === "" || a === 0 || a === false)) return true;
  return String(a) === String(b);
}

function evalExpr(code: string, doc: Record<string, unknown>): boolean {
  return truthy(new Parser(tokenize(code), doc).parse());
}

export function fieldVisible(dependsOn: string | null | undefined, doc: Record<string, unknown>): boolean {
  if (!dependsOn || !dependsOn.trim()) return true;
  const raw = dependsOn.trim();
  try {
    if (!raw.toLowerCase().startsWith("eval:")) return truthy(lookup(doc, raw));
    return evalExpr(raw.slice(5).trim(), doc);
  } catch {
    return true;
  }
}
