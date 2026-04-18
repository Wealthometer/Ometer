#!/usr/bin/env node
import * as fs   from "fs";
import * as path from "path";
import { Lexer }             from "./lexer";
import { Parser }            from "./parser";
import { Compiler, disassemble } from "./compiler";
import { VM }                from "./vm";

const args    = process.argv.slice(2);
const command = args[0];
const arg1    = args[1];

function banner() {
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
  banner();
  console.log("Usage:");
  console.log("  ometer run <file.om>       Execute an Ometer program");
  console.log("  ometer init [name]         Scaffold a new Ometer project");
  console.log("  ometer lex <file.om>       Print token stream (debug)");
  console.log("  ometer parse <file.om>     Print AST as JSON (debug)");
  console.log("  ometer compile <file.om>   Print bytecode (debug)");
  console.log("  ometer help                Show this help\n");
}

function readSource(fp: string): string {
  const resolved = path.resolve(fp);
  if (!fs.existsSync(resolved)) { console.error(`[Ometer] File not found: ${resolved}`); process.exit(1); }
  return fs.readFileSync(resolved, "utf-8");
}

function pipeline(fp: string) {
  const tokens = new Lexer(readSource(fp)).tokenize();
  const ast    = new Parser(tokens).parse();
  return new Compiler().compile(ast);
}

function initProject(projectName: string): void {
  const dir = path.resolve(projectName);
  if (fs.existsSync(dir)) { console.error(`[Ometer] Directory '${projectName}' already exists.`); process.exit(1); }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "routes"), { recursive: true });

  const pkg = {
    name: projectName, version: "1.0.0",
    description: `A project built with Ometer`,
    scripts: {
      start:       "ometer run src/main.om",
      dev:         "ometer run src/main.om",
      "dev:watch": "nodemon --ext om --exec 'ometer run src/main.om'",
      lex:         "ometer lex src/main.om",
      parse:       "ometer parse src/main.om",
      compile:     "ometer compile src/main.om",
    },
    dependencies: { ometer: "^0.1.0" },
    keywords: ["ometer", "web"],
    license: "MIT",
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n*.log\n.env\n.DS_Store\n");

  fs.writeFileSync(path.join(dir, ".ometer.json"), JSON.stringify({ version: "0.1.0", entry: "src/main.om", port: 3000 }, null, 2) + "\n");

  fs.writeFileSync(path.join(dir, "README.md"), `# ${projectName}\n\nBuilt with [Ometer](https://github.com/you/ometer).\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`);

  fs.writeFileSync(path.join(dir, "src", "main.om"), `// ${projectName} — built with Ometer
import web

let app = web.create()
let port = 3000

// Middleware — request logger
app.use(fn(req, res, next) {
  print("[" + req.method + "] " + req.path)
  next()
})

// Routes
app.get("/", fn(req, res) {
  res.json({
    message: "Welcome to ${projectName}",
    status: 200,
    powered_by: "Ometer"
  })
})

app.get("/health", fn(req, res) {
  res.json({ ok: true })
})

// Start
app.listen(port)
`);

  fs.writeFileSync(path.join(dir, "src", "routes", "index.om"), `// Example routes module
fn setupRoutes(app) {
  let items = []
  let nextId = 1

  app.get("/items", fn(req, res) {
    res.json(items)
  })

  app.post("/items", fn(req, res) {
    let item = { id: nextId, data: req.body }
    arr.push(items, item)
    nextId += 1
    res.status(201).json(item)
  })

  app.delete("/items/:id", fn(req, res) {
    res.json({ deleted: req.params.id })
  })
}
`);

  console.log(`\n  ✓  Created: ${projectName}/\n`);
  console.log(`    ${projectName}/`);
  console.log(`    ├── src/main.om           ← entry point`);
  console.log(`    ├── src/routes/index.om   ← example routes`);
  console.log(`    ├── .ometer.json          ← config`);
  console.log(`    ├── package.json          ← with run scripts`);
  console.log(`    ├── .gitignore`);
  console.log(`    └── README.md\n`);
  console.log("  Next steps:\n");
  console.log(`    cd ${projectName}`);
  console.log(`    npm install`);
  console.log(`    npm start`);
  console.log(`\n  Server → http://localhost:3000\n`);
}

switch (command) {
  case "init": initProject(arg1 || "my-ometer-app"); break;

  case "lex": {
    if (!arg1) { console.error("Usage: ometer lex <file.om>"); process.exit(1); }
    try {
      const tokens = new Lexer(readSource(arg1)).tokenize();
      console.log(`\n[Ometer Lexer] ${tokens.length} tokens\n`);
      console.log("TYPE".padEnd(16) + "VALUE".padEnd(22) + "LINE:COL");
      console.log("─".repeat(54));
      for (const t of tokens)
        console.log(`${t.type.padEnd(16)}${JSON.stringify(t.value).padEnd(22)}${t.line}:${t.col}`);
    } catch (e: any) { console.error(e.message); process.exit(1); }
    break;
  }

  case "parse": {
    if (!arg1) { console.error("Usage: ometer parse <file.om>"); process.exit(1); }
    try {
      const ast = new Parser(new Lexer(readSource(arg1)).tokenize()).parse();
      console.log(JSON.stringify(ast, null, 2));
    } catch (e: any) { console.error(e.message); process.exit(1); }
    break;
  }

  case "compile": {
    if (!arg1) { console.error("Usage: ometer compile <file.om>"); process.exit(1); }
    try { console.log(disassemble(pipeline(arg1))); }
    catch (e: any) { console.error(e.message); process.exit(1); }
    break;
  }

  case "run": {
    if (!arg1) { console.error("Usage: ometer run <file.om>"); process.exit(1); }
    try { new VM().run(pipeline(arg1)); }
    catch (e: any) { console.error(e.message); process.exit(1); }
    break;
  }

  case "help": case "--help": case "-h": default: help();
}
