// ============================================================
//  Ometer Parser
//  Converts a flat token stream (from Lexer) into an AST
//
//  Grammar (simplified):
//    program       → statement* EOF
//    statement     → letDecl | fnDecl | returnStmt | ifStmt
//                  | whileStmt | forInStmt | importStmt
//                  | printStmt | breakStmt | continueStmt
//                  | exprStmt
//    exprStmt      → expression NEWLINE
//    expression    → assignment
//    assignment    → logicalOr (("=" | "+=" | "-=" | "*=" | "/=") assignment)?
//    logicalOr     → logicalAnd ("||" logicalAnd)*
//    logicalAnd    → equality ("&&" equality)*
//    equality      → comparison (("==" | "!=") comparison)*
//    comparison    → addition (("<" | ">" | "<=" | ">=") addition)*
//    addition      → multiplication (("+" | "-") multiplication)*
//    multiplication→ power (("*" | "/" | "%") power)*
//    power         → unary ("**" unary)*
//    unary         → ("!" | "-") unary | postfix
//    postfix       → primary (call | member | index)*
//    primary       → NUMBER | STRING | BOOL | NULL | IDENT
//                  | "fn" "(" params ")" block
//                  | "[" elements "]"
//                  | "{" properties "}"
//                  | "(" expression ")"
// ============================================================

import { Token, TokenType } from "./lexer";
import * as AST from "./ast";

export class ParseError extends Error {
  constructor(msg: string, public line: number, public col: number) {
    super(`[Ometer ParseError] Line ${line}:${col} — ${msg}`);
  }
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    // Filter out NEWLINE tokens for statement-level parsing but keep them
    // accessible — we store the raw list and use a filtered view for parsing
    this.tokens = tokens.filter(t => t.type !== TokenType.NEWLINE);
  }

  // ── Helpers ──────────────────────────────────────────────

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? { type: TokenType.EOF, value: "", line: 0, col: 0 };
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (tok.type !== TokenType.EOF) this.pos++;
    return tok;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const t of types) {
      if (this.check(t)) { this.advance(); return true; }
    }
    return false;
  }

  private expect(type: TokenType, msg?: string): Token {
    if (this.check(type)) return this.advance();
    const tok = this.peek();
    throw new ParseError(
      msg ?? `Expected '${type}' but got '${tok.type}' ("${tok.value}")`,
      tok.line, tok.col
    );
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  // ── Entry Point ───────────────────────────────────────────

  parse(): AST.Program {
    const body: AST.ASTNode[] = [];
    while (!this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    return { kind: "Program", body };
  }

  // ── Statements ────────────────────────────────────────────

  private parseStatement(): AST.ASTNode {
    const tok = this.peek();

    switch (tok.type) {
      case TokenType.LET:      return this.parseLetDecl();
      case TokenType.FN:       return this.parseFnDecl();
      case TokenType.RETURN:   return this.parseReturnStmt();
      case TokenType.IF:       return this.parseIfStmt();
      case TokenType.WHILE:    return this.parseWhileStmt();
      case TokenType.FOR:      return this.parseForInStmt();
      case TokenType.IMPORT:   return this.parseImportStmt();
      case TokenType.PRINT:    return this.parsePrintStmt();
      case TokenType.BREAK:    this.advance(); return { kind: "BreakStmt", line: tok.line };
      case TokenType.CONTINUE: this.advance(); return { kind: "ContinueStmt", line: tok.line };
      default:                 return this.parseExprStmt();
    }
  }

  private parseLetDecl(): AST.LetDecl {
    const tok = this.expect(TokenType.LET);
    const name = this.expect(TokenType.IDENT, "Expected variable name after 'let'").value;

    let value: AST.ASTNode | null = null;
    if (this.match(TokenType.ASSIGN)) {
      value = this.parseExpression();
    }

    return { kind: "LetDecl", name, value, line: tok.line };
  }

  private parseFnDecl(): AST.FnDecl {
    const tok = this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENT, "Expected function name after 'fn'").value;
    const params = this.parseParams();
    const body = this.parseBlock();
    return { kind: "FnDecl", name, params, body, line: tok.line };
  }

  private parseParams(): string[] {
    this.expect(TokenType.LPAREN, "Expected '(' in function definition");
    const params: string[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        params.push(this.expect(TokenType.IDENT, "Expected parameter name").value);
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RPAREN, "Expected ')' after parameters");
    return params;
  }

  private parseBlock(): AST.BlockStmt {
    const tok = this.expect(TokenType.LBRACE, "Expected '{' to start block");
    const body: AST.ASTNode[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close block");
    return { kind: "BlockStmt", body, line: tok.line };
  }

  private parseReturnStmt(): AST.ReturnStmt {
    const tok = this.expect(TokenType.RETURN);
    let value: AST.ASTNode | null = null;

    // If next token can start an expression, parse it
    if (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      value = this.parseExpression();
    }

    return { kind: "ReturnStmt", value, line: tok.line };
  }

  private parseIfStmt(): AST.IfStmt {
    const tok = this.expect(TokenType.IF);
    this.expect(TokenType.LPAREN, "Expected '(' after 'if'");
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN, "Expected ')' after if condition");
    const consequent = this.parseBlock();

    let alternate: AST.BlockStmt | AST.IfStmt | null = null;
    if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        alternate = this.parseIfStmt() as AST.IfStmt;
      } else {
        alternate = this.parseBlock();
      }
    }

    return { kind: "IfStmt", condition, consequent, alternate, line: tok.line };
  }

  private parseWhileStmt(): AST.WhileStmt {
    const tok = this.expect(TokenType.WHILE);
    this.expect(TokenType.LPAREN, "Expected '(' after 'while'");
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN, "Expected ')' after while condition");
    const body = this.parseBlock();
    return { kind: "WhileStmt", condition, body, line: tok.line };
  }

  private parseForInStmt(): AST.ForInStmt {
    const tok = this.expect(TokenType.FOR);
    this.expect(TokenType.LPAREN, "Expected '(' after 'for'");
    const variable = this.expect(TokenType.IDENT, "Expected variable name in for-in").value;
    this.expect(TokenType.IN, "Expected 'in' after variable in for loop");
    const iterable = this.parseExpression();
    this.expect(TokenType.RPAREN, "Expected ')' after for-in iterable");
    const body = this.parseBlock();
    return { kind: "ForInStmt", variable, iterable, body, line: tok.line };
  }

  private parseImportStmt(): AST.ImportStmt {
    const tok = this.expect(TokenType.IMPORT);
    const module = this.expect(TokenType.IDENT, "Expected module name after 'import'").value;
    return { kind: "ImportStmt", module, line: tok.line };
  }

  private parsePrintStmt(): AST.PrintStmt {
    const tok = this.expect(TokenType.PRINT);
    this.expect(TokenType.LPAREN, "Expected '(' after 'print'");
    const value = this.parseExpression();
    this.expect(TokenType.RPAREN, "Expected ')' after print value");
    return { kind: "PrintStmt", value, line: tok.line };
  }

  private parseExprStmt(): AST.ExprStmt {
    const line = this.peek().line;
    const expr = this.parseExpression();
    return { kind: "ExprStmt", expr, line };
  }

  // ── Expressions (Pratt / recursive descent) ───────────────

  private parseExpression(): AST.ASTNode {
    return this.parseAssignment();
  }

  private parseAssignment(): AST.ASTNode {
    const left = this.parseLogicalOr();

    const assignOps = [
      TokenType.ASSIGN, TokenType.PLUS_EQ,
      TokenType.MINUS_EQ, TokenType.STAR_EQ, TokenType.SLASH_EQ
    ];

    if (assignOps.includes(this.peek().type)) {
      const op = this.advance().value;

      // Validate left-hand side
      if (left.kind !== "Identifier" && left.kind !== "MemberExpr" && left.kind !== "IndexExpr") {
        throw new ParseError(
          "Invalid assignment target — must be a variable, property, or index",
          (left as any).line, 0
        );
      }

      const value = this.parseAssignment();
      return { kind: "AssignExpr", target: left, operator: op, value, line: (left as any).line };
    }

    return left;
  }

  private parseLogicalOr(): AST.ASTNode {
    let left = this.parseLogicalAnd();
    while (this.check(TokenType.OR)) {
      const op = this.advance().value;
      const right = this.parseLogicalAnd();
      left = { kind: "BinaryExpr", left, operator: op, right, line: (left as any).line };
    }
    return left;
  }

  private parseLogicalAnd(): AST.ASTNode {
    let left = this.parseEquality();
    while (this.check(TokenType.AND)) {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = { kind: "BinaryExpr", left, operator: op, right, line: (left as any).line };
    }
    return left;
  }

  private parseEquality(): AST.ASTNode {
    let left = this.parseComparison();
    while (this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { kind: "BinaryExpr", left, operator: op, right, line: (left as any).line };
    }
    return left;
  }

  private parseComparison(): AST.ASTNode {
    let left = this.parseAddition();
    while ([TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE].includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this.parseAddition();
      left = { kind: "BinaryExpr", left, operator: op, right, line: (left as any).line };
    }
    return left;
  }

  private parseAddition(): AST.ASTNode {
    let left = this.parseMultiplication();
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { kind: "BinaryExpr", left, operator: op, right, line: (left as any).line };
    }
    return left;
  }

  private parseMultiplication(): AST.ASTNode {
    let left = this.parsePower();
    while ([TokenType.STAR, TokenType.SLASH, TokenType.PERCENT].includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this.parsePower();
      left = { kind: "BinaryExpr", left, operator: op, right, line: (left as any).line };
    }
    return left;
  }

  private parsePower(): AST.ASTNode {
    let left = this.parseUnary();
    if (this.check(TokenType.POWER)) {
      const op = this.advance().value;
      const right = this.parsePower(); // right-associative
      return { kind: "BinaryExpr", left, operator: op, right, line: (left as any).line };
    }
    return left;
  }

  private parseUnary(): AST.ASTNode {
    if (this.check(TokenType.BANG) || this.check(TokenType.MINUS)) {
      const tok = this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", operator: tok.value, operand, line: tok.line };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): AST.ASTNode {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check(TokenType.LPAREN)) {
        // Function call
        this.advance();
        const args: AST.ASTNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.parseExpression());
          } while (this.match(TokenType.COMMA));
        }
        this.expect(TokenType.RPAREN, "Expected ')' after arguments");
        expr = { kind: "CallExpr", callee: expr, args, line: (expr as any).line };

      } else if (this.check(TokenType.DOT)) {
        // Member access: obj.prop
        this.advance();
        const prop = this.expect(TokenType.IDENT, "Expected property name after '.'").value;
        expr = { kind: "MemberExpr", object: expr, property: prop, line: (expr as any).line };

      } else if (this.check(TokenType.LBRACKET)) {
        // Index access: arr[i]
        this.advance();
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET, "Expected ']' after index");
        expr = { kind: "IndexExpr", object: expr, index, line: (expr as any).line };

      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): AST.ASTNode {
    const tok = this.peek();

    // Number literal
    if (this.match(TokenType.NUMBER)) {
      return { kind: "NumberLiteral", value: parseFloat(tok.value), line: tok.line };
    }

    // String literal
    if (this.match(TokenType.STRING)) {
      return { kind: "StringLiteral", value: tok.value, line: tok.line };
    }

    // Bool literal
    if (this.match(TokenType.BOOL)) {
      return { kind: "BoolLiteral", value: tok.value === "true", line: tok.line };
    }

    // Null literal
    if (this.match(TokenType.NULL)) {
      return { kind: "NullLiteral", line: tok.line };
    }

    // Identifier
    if (this.match(TokenType.IDENT)) {
      return { kind: "Identifier", name: tok.value, line: tok.line };
    }

    // Anonymous function: fn(params) { body }
    if (this.match(TokenType.FN)) {
      const params = this.parseParams();
      const body = this.parseBlock();
      return { kind: "FnExpr", params, body, line: tok.line };
    }

    // Array literal: [a, b, c]
    if (this.match(TokenType.LBRACKET)) {
      const elements: AST.ASTNode[] = [];
      if (!this.check(TokenType.RBRACKET)) {
        do {
          elements.push(this.parseExpression());
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RBRACKET, "Expected ']' after array elements");
      return { kind: "ArrayLiteral", elements, line: tok.line };
    }

    // Object literal: { key: value, ... }
    if (this.match(TokenType.LBRACE)) {
      const properties: { key: string; value: AST.ASTNode }[] = [];
      if (!this.check(TokenType.RBRACE)) {
        do {
          const key = this.expect(TokenType.IDENT, "Expected property name in object").value;
          this.expect(TokenType.COLON, "Expected ':' after property name");
          const value = this.parseExpression();
          properties.push({ key, value });
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RBRACE, "Expected '}' to close object literal");
      return { kind: "ObjectLiteral", properties, line: tok.line };
    }

    // Grouped expression: (expr)
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, "Expected ')' after grouped expression");
      return expr;
    }

    throw new ParseError(
      `Unexpected token '${tok.value}' (${tok.type})`,
      tok.line, tok.col
    );
  }
}
