// ============================================================
//  Ometer Compiler
//  Walks the AST and emits a flat list of bytecode instructions
//  for the Ometer Virtual Machine (VM)
// ============================================================

import * as AST from "./ast";

// ── Opcode definitions ────────────────────────────────────────

export enum Op {
  // Stack
  PUSH        = "PUSH",        // PUSH <value>        — push constant onto stack
  POP         = "POP",         // POP                 — discard top of stack

  // Variables
  LOAD        = "LOAD",        // LOAD <name>         — push variable value
  STORE       = "STORE",       // STORE <name>        — pop and store in scope
  DEFINE      = "DEFINE",      // DEFINE <name>       — declare new variable

  // Arithmetic
  ADD         = "ADD",
  SUB         = "SUB",
  MUL         = "MUL",
  DIV         = "DIV",
  MOD         = "MOD",
  POW         = "POW",
  NEG         = "NEG",         // unary minus

  // Comparison
  EQ          = "EQ",
  NEQ         = "NEQ",
  LT          = "LT",
  GT          = "GT",
  LTE         = "LTE",
  GTE         = "GTE",

  // Logical
  AND         = "AND",
  OR          = "OR",
  NOT         = "NOT",

  // Control flow
  JUMP        = "JUMP",        // JUMP <offset>       — unconditional
  JUMP_IF_FALSE = "JUMP_IF_FALSE", // JUMP_IF_FALSE <offset>
  JUMP_IF_TRUE  = "JUMP_IF_TRUE",  // used for short-circuit ||

  // Functions
  MAKE_FN     = "MAKE_FN",     // MAKE_FN <name|""> <paramCount> <bodyIndex>
  CALL        = "CALL",        // CALL <argCount>
  RETURN      = "RETURN",

  // Objects & Arrays
  MAKE_ARRAY  = "MAKE_ARRAY",  // MAKE_ARRAY <count>
  MAKE_OBJECT = "MAKE_OBJECT", // MAKE_OBJECT <count>
  GET_MEMBER  = "GET_MEMBER",  // GET_MEMBER <prop>
  SET_MEMBER  = "SET_MEMBER",  // SET_MEMBER <prop>
  GET_INDEX   = "GET_INDEX",
  SET_INDEX   = "SET_INDEX",

  // Built-ins
  PRINT       = "PRINT",
  IMPORT      = "IMPORT",      // IMPORT <module>

  // Loop control
  BREAK       = "BREAK",
  CONTINUE    = "CONTINUE",

  // Iteration
  ITER_NEXT   = "ITER_NEXT",   // advances iterator, pushes value + done flag
  ITER_INIT   = "ITER_INIT",   // wraps top of stack in an iterator

  // Compound assign helpers
  DUP         = "DUP",         // duplicate top of stack
}

export interface Instruction {
  op: Op;
  args: (string | number | boolean | null)[];
  line: number;
}

// ── Chunk — a compiled unit (function or top-level) ───────────

export interface Chunk {
  name: string;
  instructions: Instruction[];
  constants: unknown[];           // pool of literal values
  children: Chunk[];              // nested function chunks
}

// ── Compiler error ────────────────────────────────────────────

export class CompileError extends Error {
  constructor(msg: string, public line: number) {
    super(`[Ometer CompileError] Line ${line} — ${msg}`);
  }
}

// ── Compiler ──────────────────────────────────────────────────

export class Compiler {
  private chunk: Chunk;
  private chunkStack: Chunk[] = [];

  // Tracks break/continue patch points per loop level
  private loopStack: { breaks: number[]; continues: number[] }[] = [];

  constructor() {
    this.chunk = this.makeChunk("<main>");
  }

  // ── Chunk helpers ─────────────────────────────────────────

  private makeChunk(name: string): Chunk {
    return { name, instructions: [], constants: [], children: [] };
  }

  private emit(op: Op, args: Instruction["args"], line: number): number {
    this.chunk.instructions.push({ op, args, line });
    return this.chunk.instructions.length - 1; // instruction index
  }

  private addConst(value: unknown): number {
    this.chunk.constants.push(value);
    return this.chunk.constants.length - 1;
  }

  /** Emit a placeholder JUMP and return its index for back-patching */
  private emitJump(op: Op, line: number): number {
    return this.emit(op, [0xFFFF], line);
  }

  /** Patch a previously emitted jump to point to the current instruction */
  private patch(jumpIdx: number): void {
    this.chunk.instructions[jumpIdx].args[0] = this.chunk.instructions.length;
  }

  /** Current instruction count (used for loop back-edges) */
  private here(): number {
    return this.chunk.instructions.length;
  }

  // ── Enter / leave function scope ──────────────────────────

  private enterChunk(name: string): void {
    this.chunkStack.push(this.chunk);
    const child = this.makeChunk(name);
    this.chunk.children.push(child);
    this.chunk = child;
  }

  private leaveChunk(): Chunk {
    const finished = this.chunk;
    this.chunk = this.chunkStack.pop()!;
    return finished;
  }

  // ── Public entry point ────────────────────────────────────

  compile(program: AST.Program): Chunk {
    for (const node of program.body) {
      this.compileNode(node);
    }
    this.emit(Op.PUSH, [null], 0);
    this.emit(Op.RETURN, [], 0);
    return this.chunk;
  }

  // ── Node dispatcher ───────────────────────────────────────

  private compileNode(node: AST.ASTNode): void {
    switch (node.kind) {
      case "Program":        return this.compileProgram(node);
      case "LetDecl":        return this.compileLetDecl(node);
      case "FnDecl":         return this.compileFnDecl(node);
      case "ReturnStmt":     return this.compileReturnStmt(node);
      case "IfStmt":         return this.compileIfStmt(node);
      case "WhileStmt":      return this.compileWhileStmt(node);
      case "ForInStmt":      return this.compileForInStmt(node);
      case "ImportStmt":     return this.compileImportStmt(node);
      case "PrintStmt":      return this.compilePrintStmt(node);
      case "BreakStmt":      return this.compileBreakStmt(node);
      case "ContinueStmt":   return this.compileContinueStmt(node);
      case "ExprStmt":       return this.compileExprStmt(node);
      case "BlockStmt":      return this.compileBlockStmt(node);
      case "AssignExpr":     return this.compileAssignExpr(node);
      case "BinaryExpr":     return this.compileBinaryExpr(node);
      case "UnaryExpr":      return this.compileUnaryExpr(node);
      case "CallExpr":       return this.compileCallExpr(node);
      case "MemberExpr":     return this.compileMemberExpr(node);
      case "IndexExpr":      return this.compileIndexExpr(node);
      case "FnExpr":         return this.compileFnExpr(node);
      case "Identifier":     return this.compileIdentifier(node);
      case "NumberLiteral":  return this.emit(Op.PUSH, [node.value], node.line), undefined;
      case "StringLiteral":  return this.emit(Op.PUSH, [node.value], node.line), undefined;
      case "BoolLiteral":    return this.emit(Op.PUSH, [node.value], node.line), undefined;
      case "NullLiteral":    return this.emit(Op.PUSH, [null], node.line), undefined;
      case "ArrayLiteral":   return this.compileArrayLiteral(node);
      case "ObjectLiteral":  return this.compileObjectLiteral(node);
      default:
        throw new CompileError(`Unknown AST node kind: ${(node as any).kind}`, 0);
    }
  }

  // ── Statement compilers ───────────────────────────────────

  private compileProgram(node: AST.Program): void {
    for (const stmt of node.body) this.compileNode(stmt);
  }

  private compileLetDecl(node: AST.LetDecl): void {
    if (node.value) this.compileNode(node.value);
    else            this.emit(Op.PUSH, [null], node.line);
    this.emit(Op.DEFINE, [node.name], node.line);
  }

  private compileFnDecl(node: AST.FnDecl): void {
    this.compileFunctionBody(node.name, node.params, node.body, node.line);
    this.emit(Op.DEFINE, [node.name], node.line);
  }

  private compileFnExpr(node: AST.FnExpr): void {
    this.compileFunctionBody("", node.params, node.body, node.line);
  }

  private compileFunctionBody(
    name: string,
    params: string[],
    body: AST.BlockStmt,
    line: number
  ): void {
    // Record the child chunk index before entering
    const childIdx = this.chunk.children.length;
    this.enterChunk(name || "<fn>");

    // Bind parameters as locals at call time (VM handles actual binding)
    for (const param of params) {
      this.emit(Op.DEFINE, [param], line);
    }

    this.compileBlockStmt(body);

    // Implicit return null
    this.emit(Op.PUSH, [null], line);
    this.emit(Op.RETURN, [], line);
    this.leaveChunk();

    // Push a function value onto the stack
    this.emit(Op.MAKE_FN, [name, params.length, childIdx], line);
  }

  private compileReturnStmt(node: AST.ReturnStmt): void {
    if (node.value) this.compileNode(node.value);
    else            this.emit(Op.PUSH, [null], node.line);
    this.emit(Op.RETURN, [], node.line);
  }

  private compileIfStmt(node: AST.IfStmt): void {
    this.compileNode(node.condition);
    const jumpToElse = this.emitJump(Op.JUMP_IF_FALSE, node.line);

    this.compileBlockStmt(node.consequent);
    const jumpOverElse = this.emitJump(Op.JUMP, node.line);

    this.patch(jumpToElse);
    if (node.alternate) this.compileNode(node.alternate);
    this.patch(jumpOverElse);
  }

  private compileWhileStmt(node: AST.WhileStmt): void {
    const loopStart = this.here();
    this.loopStack.push({ breaks: [], continues: [] });

    this.compileNode(node.condition);
    const exitJump = this.emitJump(Op.JUMP_IF_FALSE, node.line);

    this.compileBlockStmt(node.body);

    // Patch continues to jump here (before condition recheck)
    const { breaks, continues } = this.loopStack[this.loopStack.length - 1];
    for (const idx of continues) {
      this.chunk.instructions[idx].args[0] = loopStart;
    }

    this.emit(Op.JUMP, [loopStart], node.line);
    this.patch(exitJump);

    // Patch breaks to jump here (after loop)
    for (const idx of breaks) {
      this.chunk.instructions[idx].args[0] = this.here();
    }
    this.loopStack.pop();
  }

  private compileForInStmt(node: AST.ForInStmt): void {
    // Compile iterable, then wrap in iterator
    this.compileNode(node.iterable);
    this.emit(Op.ITER_INIT, [], node.line);

    const loopStart = this.here();
    this.loopStack.push({ breaks: [], continues: [] });

    // ITER_NEXT: push next value or null when exhausted
    this.emit(Op.ITER_NEXT, [], node.line);
    const exitJump = this.emitJump(Op.JUMP_IF_FALSE, node.line);
    this.emit(Op.DEFINE, [node.variable], node.line);

    this.compileBlockStmt(node.body);

    // Continue target = back to ITER_NEXT
    const { breaks, continues } = this.loopStack[this.loopStack.length - 1];
    for (const idx of continues) {
      this.chunk.instructions[idx].args[0] = loopStart;
    }

    this.emit(Op.JUMP, [loopStart], node.line);
    this.patch(exitJump);
    this.emit(Op.POP, [], node.line); // pop iterator

    for (const idx of breaks) {
      this.chunk.instructions[idx].args[0] = this.here();
    }
    this.loopStack.pop();
  }

  private compileImportStmt(node: AST.ImportStmt): void {
    this.emit(Op.IMPORT, [node.module], node.line);
    this.emit(Op.DEFINE, [node.module], node.line);
  }

  private compilePrintStmt(node: AST.PrintStmt): void {
    this.compileNode(node.value);
    this.emit(Op.PRINT, [], node.line);
  }

  private compileBreakStmt(node: AST.BreakStmt): void {
    if (!this.loopStack.length) {
      throw new CompileError("'break' used outside of a loop", node.line);
    }
    const idx = this.emitJump(Op.JUMP, node.line);
    this.loopStack[this.loopStack.length - 1].breaks.push(idx);
  }

  private compileContinueStmt(node: AST.ContinueStmt): void {
    if (!this.loopStack.length) {
      throw new CompileError("'continue' used outside of a loop", node.line);
    }
    const idx = this.emitJump(Op.JUMP, node.line);
    this.loopStack[this.loopStack.length - 1].continues.push(idx);
  }

  private compileExprStmt(node: AST.ExprStmt): void {
    this.compileNode(node.expr);
    this.emit(Op.POP, [], node.line); // discard expression result
  }

  private compileBlockStmt(node: AST.BlockStmt): void {
    for (const stmt of node.body) this.compileNode(stmt);
  }

  // ── Expression compilers ──────────────────────────────────

  private compileAssignExpr(node: AST.AssignExpr): void {
    if (node.operator !== "=") {
      // Compound: load current value, compile RHS, apply op, store
      this.compileNode(node.target);
      this.compileNode(node.value);
      const opMap: Record<string, Op> = {
        "+=": Op.ADD, "-=": Op.SUB, "*=": Op.MUL, "/=": Op.DIV
      };
      this.emit(opMap[node.operator], [], node.line);
    } else {
      this.compileNode(node.value);
    }

    // Store back
    const t = node.target;
    if (t.kind === "Identifier") {
      this.emit(Op.STORE, [t.name], node.line);
    } else if (t.kind === "MemberExpr") {
      this.compileNode(t.object);
      this.emit(Op.SET_MEMBER, [t.property], node.line);
    } else if (t.kind === "IndexExpr") {
      this.compileNode(t.object);
      this.compileNode(t.index);
      this.emit(Op.SET_INDEX, [], node.line);
    }

    // Assignment is an expression — leave value on stack
    this.compileNode(node.target);
  }

  private compileBinaryExpr(node: AST.BinaryExpr): void {
    // Short-circuit && and ||
    if (node.operator === "&&") {
      this.compileNode(node.left);
      this.emit(Op.DUP, [], node.line);
      const shortCircuit = this.emitJump(Op.JUMP_IF_FALSE, node.line);
      this.emit(Op.POP, [], node.line);
      this.compileNode(node.right);
      this.patch(shortCircuit);
      return;
    }
    if (node.operator === "||") {
      this.compileNode(node.left);
      this.emit(Op.DUP, [], node.line);
      const shortCircuit = this.emitJump(Op.JUMP_IF_TRUE, node.line);
      this.emit(Op.POP, [], node.line);
      this.compileNode(node.right);
      this.patch(shortCircuit);
      return;
    }

    this.compileNode(node.left);
    this.compileNode(node.right);

    const opMap: Record<string, Op> = {
      "+": Op.ADD, "-": Op.SUB, "*": Op.MUL, "/": Op.DIV,
      "%": Op.MOD, "**": Op.POW,
      "==": Op.EQ, "!=": Op.NEQ,
      "<": Op.LT, ">": Op.GT, "<=": Op.LTE, ">=": Op.GTE,
    };
    const op = opMap[node.operator];
    if (!op) throw new CompileError(`Unknown operator: ${node.operator}`, node.line);
    this.emit(op, [], node.line);
  }

  private compileUnaryExpr(node: AST.UnaryExpr): void {
    this.compileNode(node.operand);
    if (node.operator === "!")  this.emit(Op.NOT, [], node.line);
    if (node.operator === "-")  this.emit(Op.NEG, [], node.line);
  }

  private compileCallExpr(node: AST.CallExpr): void {
    // Compile callee
    this.compileNode(node.callee);
    // Compile args left to right
    for (const arg of node.args) this.compileNode(arg);
    this.emit(Op.CALL, [node.args.length], node.line);
  }

  private compileMemberExpr(node: AST.MemberExpr): void {
    this.compileNode(node.object);
    this.emit(Op.GET_MEMBER, [node.property], node.line);
  }

  private compileIndexExpr(node: AST.IndexExpr): void {
    this.compileNode(node.object);
    this.compileNode(node.index);
    this.emit(Op.GET_INDEX, [], node.line);
  }

  private compileIdentifier(node: AST.Identifier): void {
    this.emit(Op.LOAD, [node.name], node.line);
  }

  private compileArrayLiteral(node: AST.ArrayLiteral): void {
    for (const el of node.elements) this.compileNode(el);
    this.emit(Op.MAKE_ARRAY, [node.elements.length], node.line);
  }

  private compileObjectLiteral(node: AST.ObjectLiteral): void {
    for (const { key, value } of node.properties) {
      this.emit(Op.PUSH, [key], node.line);
      this.compileNode(value);
    }
    this.emit(Op.MAKE_OBJECT, [node.properties.length], node.line);
  }
}

// ── Pretty-print bytecode for debugging ──────────────────────

export function disassemble(chunk: Chunk, indent = 0): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  lines.push(`${pad}╔══ Chunk: ${chunk.name} ══`);
  chunk.instructions.forEach((ins, i) => {
    const idx  = String(i).padStart(4, "0");
    const op   = ins.op.padEnd(18);
    const args = ins.args.map(a => JSON.stringify(a)).join(", ");
    const line = `L${ins.line}`;
    lines.push(`${pad}  ${idx}  ${op}  ${args.padEnd(30)}  ; ${line}`);
  });

  for (const child of chunk.children) {
    lines.push(disassemble(child, indent + 1));
  }

  lines.push(`${pad}╚══ end ${chunk.name} ══`);
  return lines.join("\n");
}
