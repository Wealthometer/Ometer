#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Compiler, disassemble } from "./compiler";
import { VM } from "./vm";

const args = process.argv.slice(2);
const command = args[0];
const filePath = args[1];

function printBanner() {
  console.log(`
  ██████╗ ███╗   ███╗███████╗████████╗███████╗██████╗ 
 ██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝██╔════╝██╔══██╗
 ██║   ██║██╔████╔██║█████╗     ██║   █████╗  ██████╔╝
 ██║   ██║██║╚██╔╝██║██╔══╝     ██║   ██╔══╝  ██╔══██╗
 ╚██████╔╝██║ ╚═╝ ██║███████╗   ██║   ███████╗██║  ██║
  ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
  v0.1.0 — The Ometer Programming Language
`);
}

function help() {
  printBanner();
  console.log("Usage:");
  console.log("  ometer run <file.om>       Execute an Ometer source file");
  console.log("  ometer lex <file.om>       Print token stream (debug)");
  console.log("  ometer parse <file.om>     Print AST as JSON (debug)");
  console.log("  ometer compile <file.om>   Print bytecode disassembly (debug)");
  console.log("  ometer help                Show this help\n");
}

function readSource(fp: string): string {
  const resolved = path.resolve(fp);
  if (!fs.existsSync(resolved)) { console.error(`[Ometer] File not found: ${resolved}`); process.exit(1); }
  return fs.readFileSync(resolved, "utf-8");
}

function pipeline(fp: string) {
  const source = readSource(fp);
  const tokens = new Lexer(source).tokenize();
  const ast    = new Parser(tokens).parse();
  const chunk  = new Compiler().compile(ast);
  return chunk;
}

switch (command) {
  case "lex": {
    if (!filePath) { console.error("Usage: ometer lex <file.om>"); process.exit(1); }
    try {
      const tokens = new Lexer(readSource(filePath)).tokenize();
      console.log(`\n[Ometer Lexer] ${tokens.length} tokens\n`);
      console.log("TYPE".padEnd(16) + "VALUE".padEnd(20) + "LINE:COL");
      console.log("─".repeat(52));
      for (const tok of tokens)
        console.log(`${tok.type.padEnd(16)}${JSON.stringify(tok.value).padEnd(20)}${tok.line}:${tok.col}`);
    } catch(e:any) { console.error(e.message); process.exit(1); }
    break;
  }
  case "parse": {
    if (!filePath) { console.error("Usage: ometer parse <file.om>"); process.exit(1); }
    try {
      const tokens = new Lexer(readSource(filePath)).tokenize();
      const ast = new Parser(tokens).parse();
      console.log(JSON.stringify(ast, null, 2));
    } catch(e:any) { console.error(e.message); process.exit(1); }
    break;
  }
  case "compile": {
    if (!filePath) { console.error("Usage: ometer compile <file.om>"); process.exit(1); }
    try {
      const chunk = pipeline(filePath);
      console.log(`\n[Ometer Compiler] Bytecode for ${filePath}\n`);
      console.log(disassemble(chunk));
    } catch(e:any) { console.error(e.message); process.exit(1); }
    break;
  }
  case "run": {
    if (!filePath) { console.error("Usage: ometer run <file.om>"); process.exit(1); }
    try {
      const chunk = pipeline(filePath);
      const vm = new VM();
      vm.run(chunk);
    } catch(e:any) { console.error(e.message); process.exit(1); }
    break;
  }
  case "help": default: help();
}
