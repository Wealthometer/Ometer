# Ometer

A programming language compiler and virtual machine built with TypeScript.

## Overview

Ometer is a custom programming language with a complete compiler toolchain including a lexer, parser, compiler, and virtual machine. It's designed to be extensible and easy to understand.

## Project Structure

```
ometer/
├── src/
│   ├── lexer.ts         # Tokenization
│   ├── parser.ts        # Abstract Syntax Tree (AST) generation
│   ├── compiler.ts      # Code compilation
│   ├── vm.ts            # Virtual machine execution
│   ├── ast.ts           # AST type definitions
│   └── cli.ts           # Command-line interface
├── examples/            # Sample .om programs
└── package.json
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Wealthometer/Ometer.git
cd ometer
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

Run Ometer programs from the command line:

```bash
npm run start -- <file.om>
```

## Features

- **Lexer**: Tokenizes source code into meaningful units
- **Parser**: Generates an Abstract Syntax Tree (AST)
- **Compiler**: Compiles AST to bytecode
- **Virtual Machine**: Executes compiled bytecode
- **CLI**: Easy-to-use command-line interface

## Examples

See the `examples/` directory for sample Ometer programs:
- `hello.om` - Basic hello world example
- `test.om` - Test programs

## Development

### Build
```bash
npm run build
```

### Run Tests
```bash
npm test
```

### Development Mode
```bash
npm run dev
```

## Language Syntax

[Add language syntax documentation here]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Wealthometer
