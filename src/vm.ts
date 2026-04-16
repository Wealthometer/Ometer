// ============================================================
//  Ometer Virtual Machine (VM)
//  Executes bytecode chunks produced by the Compiler.
//  Stack-based architecture with lexical scope via call frames.
// ============================================================

import { Chunk, Instruction, Op } from "./compiler";
import * as http from "http";

// ── Runtime value types ────────────────────────────────────────

export type OmValue =
  | number
  | string
  | boolean
  | null
  | OmArray
  | OmObject
  | OmFunction
  | OmNativeFunction
  | OmIterator;

export interface OmArray    { kind: "array";    elements: OmValue[]; }
export interface OmObject   { kind: "object";   props: Record<string, OmValue>; }
export interface OmIterator { kind: "iterator"; items: OmValue[]; index: number; }

export interface OmFunction {
  kind:   "function";
  name:   string;
  arity:  number;
  chunk:  Chunk;          // the compiled body
  closure: Scope;         // captured environment
}

export interface OmNativeFunction {
  kind:  "native";
  name:  string;
  arity: number;
  call:  (args: OmValue[]) => OmValue;
}

// ── Scope (linked-list environment) ───────────────────────────

export class Scope {
  private vars: Map<string, OmValue> = new Map();
  constructor(public parent: Scope | null = null) {}

  get(name: string): OmValue {
    if (this.vars.has(name)) return this.vars.get(name)!;
    if (this.parent)         return this.parent.get(name);
    throw new RuntimeError(`Undefined variable '${name}'`);
  }

  set(name: string, value: OmValue): void {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent)         { this.parent.set(name, value); return; }
    throw new RuntimeError(`Cannot assign to undeclared variable '${name}'`);
  }

  define(name: string, value: OmValue): void {
    this.vars.set(name, value);
  }
}

// ── Call Frame ─────────────────────────────────────────────────

interface Frame {
  chunk:  Chunk;
  ip:     number;       // instruction pointer
  scope:  Scope;
  stack:  OmValue[];    // this frame's value stack
}

// ── Runtime Error ──────────────────────────────────────────────

export class RuntimeError extends Error {
  constructor(msg: string, public line = 0) {
    super(`[Ometer RuntimeError]${line ? ` Line ${line}` : ""} — ${msg}`);
  }
}

// ── VM ─────────────────────────────────────────────────────────

export class VM {
  private frames: Frame[] = [];
  private globals: Scope;

  constructor() {
    this.globals = new Scope();
    this.loadBuiltins();
  }

  // ── Built-in natives ────────────────────────────────────────

  private loadBuiltins(): void {
    // Math
    this.globals.define("math", {
      kind: "object",
      props: {
        floor:  this.native("floor",  1, ([x]) => Math.floor(x as number)),
        ceil:   this.native("ceil",   1, ([x]) => Math.ceil(x as number)),
        round:  this.native("round",  1, ([x]) => Math.round(x as number)),
        abs:    this.native("abs",    1, ([x]) => Math.abs(x as number)),
        sqrt:   this.native("sqrt",   1, ([x]) => Math.sqrt(x as number)),
        min:    this.native("min",    2, ([a,b]) => Math.min(a as number, b as number)),
        max:    this.native("max",    2, ([a,b]) => Math.max(a as number, b as number)),
        random: this.native("random", 0, ()  => Math.random()),
        pow:    this.native("pow",    2, ([a,b]) => Math.pow(a as number, b as number)),
        pi:     3.141592653589793,
      }
    });

    // String utils
    this.globals.define("str", {
      kind: "object",
      props: {
        len:      this.native("len",     1, ([s]) => (s as string).length),
        upper:    this.native("upper",   1, ([s]) => (s as string).toUpperCase()),
        lower:    this.native("lower",   1, ([s]) => (s as string).toLowerCase()),
        trim:     this.native("trim",    1, ([s]) => (s as string).trim()),
        split:    this.native("split",   2, ([s,d]) => ({ kind: "array", elements: (s as string).split(d as string) } as OmArray)),
        includes: this.native("includes",2, ([s,t]) => (s as string).includes(t as string)),
        starts:   this.native("starts",  2, ([s,t]) => (s as string).startsWith(t as string)),
        ends:     this.native("ends",    2, ([s,t]) => (s as string).endsWith(t as string)),
        slice:    this.native("slice",   3, ([s,a,b]) => (s as string).slice(a as number, b as number || undefined)),
        replace:  this.native("replace", 3, ([s,f,t]) => (s as string).replace(f as string, t as string)),
        num:      this.native("num",     1, ([s]) => parseFloat(s as string)),
      }
    });

    // Array utils
    this.globals.define("arr", {
      kind: "object",
      props: {
        len:     this.native("len",    1, ([a]) => (a as OmArray).elements.length),
        push:    this.native("push",   2, ([a,v]) => { (a as OmArray).elements.push(v); return a; }),
        pop:     this.native("pop",    1, ([a]) => (a as OmArray).elements.pop() ?? null),
        join:    this.native("join",   2, ([a,d]) => (a as OmArray).elements.map(e => this.toStr(e)).join(d as string)),
        slice:   this.native("slice",  3, ([a,s,e]) => ({ kind:"array", elements: (a as OmArray).elements.slice(s as number, e as number || undefined) } as OmArray)),
        reverse: this.native("reverse",1, ([a]) => { (a as OmArray).elements.reverse(); return a; }),
        includes:this.native("includes",2, ([a,v]) => (a as OmArray).elements.some(e => this.valEq(e, v))),
        first:   this.native("first",  1, ([a]) => (a as OmArray).elements[0] ?? null),
        last:    this.native("last",   1, ([a]) => (a as OmArray).elements[(a as OmArray).elements.length - 1] ?? null),
      }
    });

    // Type checks
    this.globals.define("type", this.native("type", 1, ([v]) => {
      if (v === null) return "null";
      if (Array.isArray(v)) return "array";
      if (typeof v === "object" && (v as any).kind === "array")    return "array";
      if (typeof v === "object" && (v as any).kind === "object")   return "object";
      if (typeof v === "object" && (v as any).kind === "function")  return "function";
      return typeof v;
    }));

    this.globals.define("num",  this.native("num",  1, ([v]) => Number(v)));
    this.globals.define("bool", this.native("bool", 1, ([v]) => this.isTruthy(v)));
    this.globals.define("str_of", this.native("str_of", 1, ([v]) => this.toStr(v)));
  }

  private native(name: string, arity: number, call: (args: OmValue[]) => OmValue): OmNativeFunction {
    return { kind: "native", name, arity, call };
  }

  // ── Web stdlib ──────────────────────────────────────────────

  private makeWebModule(): OmValue {
    const vm = this;
    return {
      kind: "object",
      props: {
        create: {
          kind: "native", name: "create", arity: 0,
          call: () => vm.makeApp()
        }
      }
    };
  }

  private makeApp(): OmObject {
    const routes: { method: string; path: string; handler: OmValue }[] = [];
    const middlewares: OmValue[] = [];
    const vm = this;

    const app: OmObject = {
      kind: "object",
      props: {
        get:    { kind:"native", name:"get",    arity:2, call:([path,fn])=>{routes.push({method:"GET",   path:path as string,handler:fn});return app;} } as OmNativeFunction,
        post:   { kind:"native", name:"post",   arity:2, call:([path,fn])=>{routes.push({method:"POST",  path:path as string,handler:fn});return app;} } as OmNativeFunction,
        put:    { kind:"native", name:"put",    arity:2, call:([path,fn])=>{routes.push({method:"PUT",   path:path as string,handler:fn});return app;} } as OmNativeFunction,
        delete: { kind:"native", name:"delete", arity:2, call:([path,fn])=>{routes.push({method:"DELETE",path:path as string,handler:fn});return app;} } as OmNativeFunction,
        use:    { kind:"native", name:"use",    arity:1, call:([fn])=>{middlewares.push(fn);return app;} } as OmNativeFunction,
        listen: {
          kind:"native", name:"listen", arity:1,
          call: ([portVal]) => {
            const port = portVal as number;
            const server = http.createServer((req, res) => {
              const method = req.method ?? "GET";
              const url    = req.url ?? "/";
              const [pathname, queryStr] = url.split("?");

              // Build query object
              const query: Record<string, string> = {};
              if (queryStr) {
                queryStr.split("&").forEach(pair => {
                  const [k, v] = pair.split("=");
                  if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
                });
              }

              // Build request object
              let statusCode = 200;
              const reqObj: OmObject = {
                kind: "object",
                props: {
                  method:  method,
                  path:    pathname,
                  url:     url,
                  query:   { kind:"object", props: query },
                  headers: { kind:"object", props: req.headers as any },
                  params:  { kind:"object", props: {} },
                  body:    null,
                }
              };

              // Build response object
              const resObj: OmObject = {
                kind: "object",
                props: {
                  send: { kind:"native", name:"send", arity:1, call:([body]) => {
                    res.writeHead(statusCode, {"Content-Type":"text/plain"});
                    res.end(vm.toStr(body)); return null;
                  }} as OmNativeFunction,
                  json: { kind:"native", name:"json", arity:1, call:([data]) => {
                    res.writeHead(statusCode, {"Content-Type":"application/json"});
                    res.end(JSON.stringify(vm.omToJs(data))); return null;
                  }} as OmNativeFunction,
                  html: { kind:"native", name:"html", arity:1, call:([body]) => {
                    res.writeHead(statusCode, {"Content-Type":"text/html"});
                    res.end(vm.toStr(body)); return null;
                  }} as OmNativeFunction,
                  status: { kind:"native", name:"status", arity:1, call:([code]) => {
                    statusCode = code as number; return resObj;
                  }} as OmNativeFunction,
                  redirect: { kind:"native", name:"redirect", arity:1, call:([url]) => {
                    res.writeHead(302, {Location: url as string});
                    res.end(); return null;
                  }} as OmNativeFunction,
                }
              };

              // Parse body for POST/PUT
              let bodyData = "";
              req.on("data", chunk => { bodyData += chunk; });
              req.on("end", () => {
                try {
                  if (bodyData) {
                    const parsed = JSON.parse(bodyData);
                    (reqObj.props as any).body = vm.jsToOm(parsed);
                  }
                } catch {}

                // Run middleware chain then route
                const handlers: OmValue[] = [...middlewares];

                // Find matching route
                let matched = false;
                for (const route of routes) {
                  if (route.method !== method) continue;

                  // Simple param matching: /users/:id
                  const routeParts = route.path.split("/");
                  const pathParts  = pathname.split("/");
                  if (routeParts.length !== pathParts.length) continue;

                  const params: Record<string, string> = {};
                  let ok = true;
                  for (let i = 0; i < routeParts.length; i++) {
                    if (routeParts[i].startsWith(":")) {
                      params[routeParts[i].slice(1)] = pathParts[i];
                    } else if (routeParts[i] !== pathParts[i]) {
                      ok = false; break;
                    }
                  }

                  if (ok) {
                    (reqObj.props as any).params = { kind:"object", props: params };
                    handlers.push(route.handler);
                    matched = true;
                    break;
                  }
                }

                if (!matched) {
                  res.writeHead(404, {"Content-Type":"application/json"});
                  res.end(JSON.stringify({error:"Not Found", path:pathname}));
                  return;
                }

                // Execute handler chain
                let idx = 0;
                const next = (): OmValue => {
                  if (idx >= handlers.length) return null;
                  const handler = handlers[idx++];
                  // middleware gets (req, res, next), route gets (req, res)
                  const isMiddleware = idx <= middlewares.length;
                  const fnArgs: OmValue[] = isMiddleware
                    ? [reqObj, resObj, { kind:"native", name:"next", arity:0, call:next } as OmNativeFunction]
                    : [reqObj, resObj];
                  return vm.callValue(handler, fnArgs);
                };
                next();
              });
            });

            server.listen(port, () => {
              console.log(`\n  🚀 Ometer server running → http://localhost:${port}\n`);
            });
            return null;
          }
        } as OmNativeFunction
      }
    };
    return app;
  }

  // ── Execution ───────────────────────────────────────────────

  run(chunk: Chunk): OmValue {
    const frame: Frame = {
      chunk,
      ip: 0,
      scope: this.globals,
      stack: [],
    };
    this.frames.push(frame);
    return this.execute();
  }

  private execute(): OmValue {
    while (true) {
      const frame = this.currentFrame();
      if (frame.ip >= frame.chunk.instructions.length) return null;

      const ins = frame.chunk.instructions[frame.ip++];

      try {
        const result = this.step(ins, frame);
        if (result !== undefined) return result; // RETURN signal
      } catch (e: any) {
        if (e instanceof RuntimeError) throw e;
        throw new RuntimeError(e.message, ins.line);
      }
    }
  }

  private step(ins: Instruction, frame: Frame): OmValue | undefined {
    const { op, args, line } = ins;
    const stack = frame.stack;

    const pop  = (): OmValue => stack.pop() ?? null;
    const push = (v: OmValue) => stack.push(v);
    const peek = (): OmValue => stack[stack.length - 1] ?? null;

    switch (op) {

      // ── Stack ──
      case Op.PUSH:   push(args[0] as OmValue); break;
      case Op.POP:    pop(); break;
      case Op.DUP:    push(peek()); break;

      // ── Variables ──
      case Op.LOAD:   push(frame.scope.get(args[0] as string)); break;
      case Op.STORE:  frame.scope.set(args[0] as string, pop()); push(peek()); break;
      case Op.DEFINE: frame.scope.define(args[0] as string, pop()); break;

      // ── Arithmetic ──
      case Op.ADD: {
        const b = pop(), a = pop();
        if (typeof a === "string" || typeof b === "string")
          push(this.toStr(a) + this.toStr(b));
        else
          push((a as number) + (b as number));
        break;
      }
      case Op.SUB: { const b=pop(),a=pop(); push((a as number)-(b as number)); break; }
      case Op.MUL: { const b=pop(),a=pop(); push((a as number)*(b as number)); break; }
      case Op.DIV: {
        const b=pop(),a=pop();
        if ((b as number)===0) throw new RuntimeError("Division by zero", line);
        push((a as number)/(b as number)); break;
      }
      case Op.MOD: { const b=pop(),a=pop(); push((a as number)%(b as number)); break; }
      case Op.POW: { const b=pop(),a=pop(); push(Math.pow(a as number,b as number)); break; }
      case Op.NEG: push(-(pop() as number)); break;
      case Op.NOT: push(!this.isTruthy(pop())); break;

      // ── Comparison ──
      case Op.EQ:  { const b=pop(),a=pop(); push(this.valEq(a,b));  break; }
      case Op.NEQ: { const b=pop(),a=pop(); push(!this.valEq(a,b)); break; }
      case Op.LT:  { const b=pop(),a=pop(); push((a as number)<(b as number));  break; }
      case Op.GT:  { const b=pop(),a=pop(); push((a as number)>(b as number));  break; }
      case Op.LTE: { const b=pop(),a=pop(); push((a as number)<=(b as number)); break; }
      case Op.GTE: { const b=pop(),a=pop(); push((a as number)>=(b as number)); break; }

      // ── Control flow ──
      case Op.JUMP:          frame.ip = args[0] as number; break;
      case Op.JUMP_IF_FALSE: {
        const v = pop();
        if (!this.isTruthy(v)) {
          frame.ip = args[0] as number;
        } else {
          push(v); // restore for DEFINE to consume
        }
        break;
      }
      case Op.JUMP_IF_TRUE:  { const v=pop(); if  (this.isTruthy(v)) frame.ip=args[0] as number; break; }

      // ── Functions ──
      case Op.MAKE_FN: {
        const [name, arity, childIdx] = args as [string, number, number];
        const fn: OmFunction = {
          kind: "function",
          name: name || "<fn>",
          arity,
          chunk: frame.chunk.children[childIdx],
          closure: frame.scope,
        };
        push(fn);
        break;
      }

      case Op.CALL: {
        const argCount = args[0] as number;
        const callArgs: OmValue[] = [];
        for (let i = 0; i < argCount; i++) callArgs.unshift(pop());
        const callee = pop();
        const result = this.callValue(callee, callArgs, line);
        push(result);
        break;
      }

      case Op.RETURN: {
        const retVal = pop();
        this.frames.pop();
        return retVal;
      }

      // ── Collections ──
      case Op.MAKE_ARRAY: {
        const count = args[0] as number;
        const elements: OmValue[] = [];
        for (let i = 0; i < count; i++) elements.unshift(pop());
        push({ kind: "array", elements });
        break;
      }

      case Op.MAKE_OBJECT: {
        const count = args[0] as number;
        const props: Record<string, OmValue> = {};
        for (let i = 0; i < count; i++) {
          const val = pop();
          const key = pop() as string;
          props[key] = val;
        }
        push({ kind: "object", props });
        break;
      }

      case Op.GET_MEMBER: {
        const prop = args[0] as string;
        const obj  = pop();
        push(this.getMember(obj, prop, line));
        break;
      }

      case Op.SET_MEMBER: {
        const prop  = args[0] as string;
        const obj   = pop() as OmObject;
        const value = pop();
        if (obj?.kind !== "object") throw new RuntimeError(`Cannot set property on non-object`, line);
        obj.props[prop] = value;
        push(value);
        break;
      }

      case Op.GET_INDEX: {
        const idx = pop();
        const obj = pop();
        if ((obj as OmArray)?.kind === "array") {
          push((obj as OmArray).elements[idx as number] ?? null);
        } else if ((obj as OmObject)?.kind === "object") {
          push((obj as OmObject).props[idx as string] ?? null);
        } else if (typeof obj === "string") {
          push((obj as string)[idx as number] ?? null);
        } else {
          throw new RuntimeError("Cannot index non-array/object", line);
        }
        break;
      }

      case Op.SET_INDEX: {
        const idx = pop();
        const obj = pop();
        const val = pop();
        if ((obj as OmArray)?.kind === "array") {
          (obj as OmArray).elements[idx as number] = val;
        } else if ((obj as OmObject)?.kind === "object") {
          (obj as OmObject).props[idx as string] = val;
        } else {
          throw new RuntimeError("Cannot index-assign non-array/object", line);
        }
        push(val);
        break;
      }

      // ── Iteration ──
      case Op.ITER_INIT: {
        const iterable = pop();
        let items: OmValue[] = [];
        if ((iterable as OmArray)?.kind === "array") {
          items = [...(iterable as OmArray).elements];
        } else if ((iterable as OmObject)?.kind === "object") {
          items = Object.keys((iterable as OmObject).props);
        } else if (typeof iterable === "string") {
          items = [...(iterable as string)];
        }
        push({ kind: "iterator", items, index: 0 });
        break;
      }

      case Op.ITER_NEXT: {
        // Iterator sits under top of stack; we peek without removing it
        const iterVal = stack[stack.length - 1];
        const iter = iterVal as OmIterator;
        if (!iter || iter.kind !== "iterator" || iter.index >= iter.items.length) {
          push(null); // exhausted — falsy, triggers JUMP_IF_FALSE exit
        } else {
          push(iter.items[iter.index++]); // value for DEFINE; truthy keeps loop going
        }
        break;
      }

      // ── I/O ──
      case Op.PRINT:  console.log(this.toStr(pop())); break;

      // ── Modules ──
      case Op.IMPORT: {
        const mod = args[0] as string;
        switch (mod) {
          case "web": push(this.makeWebModule()); break;
          default: throw new RuntimeError(`Unknown module '${mod}'`, line);
        }
        break;
      }

      default:
        throw new RuntimeError(`Unknown opcode: ${op}`, line);
    }

    return undefined; // not returning yet
  }

  // ── Call a value ────────────────────────────────────────────

  callValue(callee: OmValue, args: OmValue[], line = 0): OmValue {
    if ((callee as OmNativeFunction)?.kind === "native") {
      const fn = callee as OmNativeFunction;
      return fn.call(args);
    }

    if ((callee as OmFunction)?.kind === "function") {
      const fn = callee as OmFunction;

      // Build new scope from closure
      const callScope = new Scope(fn.closure);

      // Bind parameters (DEFINE ops in the chunk body handle this,
      // but we need to push args onto the new frame's stack first)
      const frame: Frame = {
        chunk: fn.chunk,
        ip: 0,
        scope: callScope,
        stack: [...args].reverse(), // args available for DEFINE instructions
      };

      this.frames.push(frame);
      const result = this.execute();
      return result ?? null;
    }

    // Member method call on object (obj.method(args))
    throw new RuntimeError(`Cannot call non-function value: ${this.toStr(callee)}`, line);
  }

  // ── Helpers ─────────────────────────────────────────────────

  private currentFrame(): Frame {
    return this.frames[this.frames.length - 1];
  }

  private getMember(obj: OmValue, prop: string, line = 0): OmValue {
    if ((obj as OmObject)?.kind === "object") {
      const val = (obj as OmObject).props[prop];
      if (val === undefined) return null;
      return val;
    }
    if ((obj as OmArray)?.kind === "array") {
      // Built-in array methods
      const arr = obj as OmArray;
      const methods: Record<string, OmNativeFunction> = {
        length:  { kind:"native", name:"length",  arity:0, call:()=>arr.elements.length },
        push:    { kind:"native", name:"push",    arity:1, call:([v])=>{arr.elements.push(v);return arr;} },
        pop:     { kind:"native", name:"pop",     arity:0, call:()=>arr.elements.pop()??null },
        join:    { kind:"native", name:"join",    arity:1, call:([d])=>arr.elements.map(e=>this.toStr(e)).join(d as string) },
        reverse: { kind:"native", name:"reverse", arity:0, call:()=>{arr.elements.reverse();return arr;} },
        slice:   { kind:"native", name:"slice",   arity:2, call:([a,b])=>({kind:"array",elements:arr.elements.slice(a as number,b as number||undefined)} as OmArray) },
        includes:{ kind:"native", name:"includes",arity:1, call:([v])=>arr.elements.some(e=>this.valEq(e,v)) },
      };
      if (prop === "length") return arr.elements.length;
      return methods[prop] ?? null;
    }
    if (typeof obj === "string") {
      const s = obj as string;
      const methods: Record<string, OmNativeFunction> = {
        length:   { kind:"native", name:"length",   arity:0, call:()=>s.length },
        upper:    { kind:"native", name:"upper",    arity:0, call:()=>s.toUpperCase() },
        lower:    { kind:"native", name:"lower",    arity:0, call:()=>s.toLowerCase() },
        trim:     { kind:"native", name:"trim",     arity:0, call:()=>s.trim() },
        includes: { kind:"native", name:"includes", arity:1, call:([t])=>s.includes(t as string) },
        split:    { kind:"native", name:"split",    arity:1, call:([d])=>({kind:"array",elements:s.split(d as string)} as OmArray) },
        replace:  { kind:"native", name:"replace",  arity:2, call:([f,t])=>s.replace(f as string,t as string) },
        slice:    { kind:"native", name:"slice",    arity:2, call:([a,b])=>s.slice(a as number,b as number||undefined) },
        starts:   { kind:"native", name:"starts",   arity:1, call:([t])=>s.startsWith(t as string) },
        ends:     { kind:"native", name:"ends",     arity:1, call:([t])=>s.endsWith(t as string) },
      };
      if (prop === "length") return s.length;
      return methods[prop] ?? null;
    }
    throw new RuntimeError(`Cannot access property '${prop}' on ${this.toStr(obj)}`, line);
  }

  isTruthy(v: OmValue): boolean {
    if (v === null || v === false || v === 0 || v === "") return false;
    return true;
  }

  valEq(a: OmValue, b: OmValue): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  toStr(v: OmValue): string {
    if (v === null)   return "null";
    if (v === true)   return "true";
    if (v === false)  return "false";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v;
    if ((v as OmArray)?.kind  === "array")    return "[" + (v as OmArray).elements.map(e => this.toStr(e)).join(", ") + "]";
    if ((v as OmObject)?.kind === "object")   return "{" + Object.entries((v as OmObject).props).map(([k,vv]) => `${k}: ${this.toStr(vv)}`).join(", ") + "}";
    if ((v as OmFunction)?.kind === "function")  return `<fn ${(v as OmFunction).name}>`;
    if ((v as OmNativeFunction)?.kind === "native") return `<native ${(v as OmNativeFunction).name}>`;
    return String(v);
  }

  // Convert Om value to plain JS for JSON serialization
  omToJs(v: OmValue): unknown {
    if (v === null || typeof v !== "object") return v;
    if ((v as OmArray).kind  === "array")  return (v as OmArray).elements.map(e => this.omToJs(e));
    if ((v as OmObject).kind === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries((v as OmObject).props)) out[k] = this.omToJs(vv);
      return out;
    }
    return this.toStr(v);
  }

  // Convert plain JS to Om value
  jsToOm(v: unknown): OmValue {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v;
    if (typeof v === "number")  return v;
    if (typeof v === "string")  return v;
    if (Array.isArray(v)) return { kind:"array", elements: v.map(e => this.jsToOm(e)) };
    if (typeof v === "object") {
      const props: Record<string, OmValue> = {};
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) props[k] = this.jsToOm(vv);
      return { kind:"object", props };
    }
    return null;
  }
}
