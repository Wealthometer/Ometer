// ============================================================
//  Ometer Lexer
//  Turns raw .om source code into a flat stream of tokens
// ============================================================

export enum TokenType {
  // Literals
  NUMBER     = "NUMBER",
  STRING     = "STRING",
  BOOL       = "BOOL",
  NULL       = "NULL",

  // Identifiers & Keywords
  IDENT      = "IDENT",
  LET        = "LET",
  FN         = "FN",
  RETURN     = "RETURN",
  IF         = "IF",
  ELSE       = "ELSE",
  WHILE      = "WHILE",
  FOR        = "FOR",
  IN         = "IN",
  IMPORT     = "IMPORT",
  PRINT      = "PRINT",
  BREAK      = "BREAK",
  CONTINUE   = "CONTINUE",

  // Arithmetic Operators
  PLUS       = "PLUS",       // +
  MINUS      = "MINUS",      // -
  STAR       = "STAR",       // *
  SLASH      = "SLASH",      // /
  PERCENT    = "PERCENT",    // %
  POWER      = "POWER",      // **

  // Comparison Operators
  EQ         = "EQ",         // ==
  NEQ        = "NEQ",        // !=
  LT         = "LT",         // <
  GT         = "GT",         // >
  LTE        = "LTE",        // <=
  GTE        = "GTE",        // >=

  // Logical Operators
  AND        = "AND",        // &&
  OR         = "OR",         // ||
  BANG       = "BANG",       // !

  // Assignment
  ASSIGN     = "ASSIGN",     // =
  PLUS_EQ    = "PLUS_EQ",    // +=
  MINUS_EQ   = "MINUS_EQ",   // -=
  STAR_EQ    = "STAR_EQ",    // *=
  SLASH_EQ   = "SLASH_EQ",   // /=

  // Delimiters
  LPAREN     = "LPAREN",     // (
  RPAREN     = "RPAREN",     // )
  LBRACE     = "LBRACE",     // {
  RBRACE     = "RBRACE",     // }
  LBRACKET   = "LBRACKET",   // [
  RBRACKET   = "RBRACKET",   // ]
  COMMA      = "COMMA",      // ,
  SEMICOLON  = "SEMICOLON",  // ;
  COLON      = "COLON",      // :
  DOT        = "DOT",        // .
  ARROW      = "ARROW",      // ->

  // Special
  EOF        = "EOF",
  NEWLINE    = "NEWLINE",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS: Record<string, TokenType> = {
  let:      TokenType.LET,
  fn:       TokenType.FN,
  return:   TokenType.RETURN,
  if:       TokenType.IF,
  else:     TokenType.ELSE,
  while:    TokenType.WHILE,
  for:      TokenType.FOR,
  in:       TokenType.IN,
  import:   TokenType.IMPORT,
  print:    TokenType.PRINT,
  true:     TokenType.BOOL,
  false:    TokenType.BOOL,
  null:     TokenType.NULL,
  break:    TokenType.BREAK,
  continue: TokenType.CONTINUE,
};

export class LexerError extends Error {
  constructor(msg: string, public line: number, public col: number) {
    super(`[Ometer LexerError] Line ${line}:${col} — ${msg}`);
  }
}

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  // ── Helpers ──────────────────────────────────────────────

  private peek(offset = 0): string {
    return this.source[this.pos + offset] ?? "\0";
  }

  private advance(): string {
    const ch = this.source[this.pos++];
    if (ch === "\n") { this.line++; this.col = 1; }
    else { this.col++; }
    return ch;
  }

  private match(expected: string): boolean {
    if (this.peek() === expected) {
      this.advance();
      return true;
    }
    return false;
  }

  private addToken(type: TokenType, value: string, line: number, col: number) {
    this.tokens.push({ type, value, line, col });
  }

  private isDigit(ch: string): boolean { return ch >= "0" && ch <= "9"; }
  private isAlpha(ch: string): boolean { return /[a-zA-Z_]/.test(ch); }
  private isAlphaNum(ch: string): boolean { return /[a-zA-Z0-9_]/.test(ch); }
  private isAtEnd(): boolean { return this.pos >= this.source.length; }

  // ── Scanners ─────────────────────────────────────────────

  private scanString(quote: string): void {
    const startLine = this.line;
    const startCol  = this.col;
    let str = "";

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === "\\" ) {
        this.advance(); // consume backslash
        const esc = this.advance();
        switch (esc) {
          case "n":  str += "\n"; break;
          case "t":  str += "\t"; break;
          case "r":  str += "\r"; break;
          case "\\": str += "\\"; break;
          case "'":  str += "'";  break;
          case '"':  str += '"';  break;
          default:   str += "\\" + esc;
        }
      } else {
        str += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new LexerError("Unterminated string literal", startLine, startCol);
    }

    this.advance(); // closing quote
    this.addToken(TokenType.STRING, str, startLine, startCol);
  }

  private scanNumber(): void {
    const startLine = this.line;
    const startCol  = this.col - 1;
    let num = this.source[this.pos - 1];

    while (this.isDigit(this.peek())) num += this.advance();

    if (this.peek() === "." && this.isDigit(this.peek(1))) {
      num += this.advance(); // consume "."
      while (this.isDigit(this.peek())) num += this.advance();
    }

    this.addToken(TokenType.NUMBER, num, startLine, startCol);
  }

  private scanIdent(): void {
    const startLine = this.line;
    const startCol  = this.col - 1;
    let ident = this.source[this.pos - 1];

    while (this.isAlphaNum(this.peek())) ident += this.advance();

    const kwType = KEYWORDS[ident];
    this.addToken(kwType ?? TokenType.IDENT, ident, startLine, startCol);
  }

  private skipLineComment(): void {
    while (!this.isAtEnd() && this.peek() !== "\n") this.advance();
  }

  private skipBlockComment(): void {
    const startLine = this.line;
    const startCol  = this.col;
    while (!this.isAtEnd()) {
      if (this.peek() === "*" && this.peek(1) === "/") {
        this.advance(); this.advance();
        return;
      }
      this.advance();
    }
    throw new LexerError("Unterminated block comment", startLine, startCol);
  }

  // ── Main scan loop ────────────────────────────────────────

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      const startLine = this.line;
      const startCol  = this.col;
      const ch = this.advance();

      switch (ch) {
        // ── Whitespace ──
        case " ": case "\r": case "\t": break;
        case "\n":
          this.addToken(TokenType.NEWLINE, "\\n", startLine, startCol);
          break;

        // ── Single-char tokens ──
        case "(": this.addToken(TokenType.LPAREN,    ch, startLine, startCol); break;
        case ")": this.addToken(TokenType.RPAREN,    ch, startLine, startCol); break;
        case "{": this.addToken(TokenType.LBRACE,    ch, startLine, startCol); break;
        case "}": this.addToken(TokenType.RBRACE,    ch, startLine, startCol); break;
        case "[": this.addToken(TokenType.LBRACKET,  ch, startLine, startCol); break;
        case "]": this.addToken(TokenType.RBRACKET,  ch, startLine, startCol); break;
        case ",": this.addToken(TokenType.COMMA,     ch, startLine, startCol); break;
        case ";": this.addToken(TokenType.SEMICOLON, ch, startLine, startCol); break;
        case ":": this.addToken(TokenType.COLON,     ch, startLine, startCol); break;
        case "%": this.addToken(TokenType.PERCENT,   ch, startLine, startCol); break;

        // ── Dot ──
        case ".": this.addToken(TokenType.DOT, ch, startLine, startCol); break;

        // ── Operators (possibly compound) ──
        case "+":
          if (this.match("=")) this.addToken(TokenType.PLUS_EQ,  "+=", startLine, startCol);
          else                 this.addToken(TokenType.PLUS,      "+",  startLine, startCol);
          break;
        case "-":
          if (this.match(">")) this.addToken(TokenType.ARROW,    "->", startLine, startCol);
          else if (this.match("=")) this.addToken(TokenType.MINUS_EQ, "-=", startLine, startCol);
          else                 this.addToken(TokenType.MINUS,     "-",  startLine, startCol);
          break;
        case "*":
          if (this.match("*")) this.addToken(TokenType.POWER,    "**", startLine, startCol);
          else if (this.match("=")) this.addToken(TokenType.STAR_EQ, "*=", startLine, startCol);
          else                 this.addToken(TokenType.STAR,      "*",  startLine, startCol);
          break;
        case "/":
          if (this.match("/"))      this.skipLineComment();
          else if (this.match("*")) this.skipBlockComment();
          else if (this.match("=")) this.addToken(TokenType.SLASH_EQ, "/=", startLine, startCol);
          else                      this.addToken(TokenType.SLASH,     "/",  startLine, startCol);
          break;
        case "!":
          if (this.match("=")) this.addToken(TokenType.NEQ,  "!=", startLine, startCol);
          else                 this.addToken(TokenType.BANG,  "!",  startLine, startCol);
          break;
        case "=":
          if (this.match("=")) this.addToken(TokenType.EQ,     "==", startLine, startCol);
          else                 this.addToken(TokenType.ASSIGN,  "=",  startLine, startCol);
          break;
        case "<":
          if (this.match("=")) this.addToken(TokenType.LTE, "<=", startLine, startCol);
          else                 this.addToken(TokenType.LT,  "<",  startLine, startCol);
          break;
        case ">":
          if (this.match("=")) this.addToken(TokenType.GTE, ">=", startLine, startCol);
          else                 this.addToken(TokenType.GT,  ">",  startLine, startCol);
          break;
        case "&":
          if (this.match("&")) this.addToken(TokenType.AND, "&&", startLine, startCol);
          else throw new LexerError(`Unexpected character '&' (did you mean '&&'?)`, startLine, startCol);
          break;
        case "|":
          if (this.match("|")) this.addToken(TokenType.OR, "||", startLine, startCol);
          else throw new LexerError(`Unexpected character '|' (did you mean '||'?)`, startLine, startCol);
          break;

        // ── Strings ──
        case '"': this.scanString('"'); break;
        case "'": this.scanString("'"); break;

        // ── Numbers & Identifiers ──
        default:
          if (this.isDigit(ch))  this.scanNumber();
          else if (this.isAlpha(ch)) this.scanIdent();
          else throw new LexerError(`Unexpected character '${ch}'`, startLine, startCol);
      }
    }

    this.addToken(TokenType.EOF, "", this.line, this.col);
    return this.tokens;
  }
}
