// ============================================================
//  Ometer AST — Abstract Syntax Tree Node Definitions
//  Every construct in the language maps to one of these nodes
// ============================================================

export type ASTNode =
  | Program
  | LetDecl
  | FnDecl
  | ReturnStmt
  | IfStmt
  | WhileStmt
  | ForInStmt
  | ImportStmt
  | PrintStmt
  | BreakStmt
  | ContinueStmt
  | ExprStmt
  | BlockStmt
  | AssignExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | FnExpr
  | Identifier
  | NumberLiteral
  | StringLiteral
  | BoolLiteral
  | NullLiteral
  | ArrayLiteral
  | ObjectLiteral;

// ── Top level ────────────────────────────────────────────────

export interface Program {
  kind: "Program";
  body: ASTNode[];
}

// ── Statements ───────────────────────────────────────────────

export interface LetDecl {
  kind: "LetDecl";
  name: string;
  value: ASTNode | null;
  line: number;
}

export interface FnDecl {
  kind: "FnDecl";
  name: string;
  params: string[];
  body: BlockStmt;
  line: number;
}

export interface ReturnStmt {
  kind: "ReturnStmt";
  value: ASTNode | null;
  line: number;
}

export interface IfStmt {
  kind: "IfStmt";
  condition: ASTNode;
  consequent: BlockStmt;
  alternate: BlockStmt | IfStmt | null;
  line: number;
}

export interface WhileStmt {
  kind: "WhileStmt";
  condition: ASTNode;
  body: BlockStmt;
  line: number;
}

export interface ForInStmt {
  kind: "ForInStmt";
  variable: string;
  iterable: ASTNode;
  body: BlockStmt;
  line: number;
}

export interface ImportStmt {
  kind: "ImportStmt";
  module: string;
  line: number;
}

export interface PrintStmt {
  kind: "PrintStmt";
  value: ASTNode;
  line: number;
}

export interface BreakStmt {
  kind: "BreakStmt";
  line: number;
}

export interface ContinueStmt {
  kind: "ContinueStmt";
  line: number;
}

export interface ExprStmt {
  kind: "ExprStmt";
  expr: ASTNode;
  line: number;
}

export interface BlockStmt {
  kind: "BlockStmt";
  body: ASTNode[];
  line: number;
}

// ── Expressions ──────────────────────────────────────────────

export interface AssignExpr {
  kind: "AssignExpr";
  target: ASTNode;          // Identifier | MemberExpr | IndexExpr
  operator: string;         // = += -= *= /=
  value: ASTNode;
  line: number;
}

export interface BinaryExpr {
  kind: "BinaryExpr";
  left: ASTNode;
  operator: string;
  right: ASTNode;
  line: number;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  operator: string;         // ! -
  operand: ASTNode;
  line: number;
}

export interface CallExpr {
  kind: "CallExpr";
  callee: ASTNode;
  args: ASTNode[];
  line: number;
}

export interface MemberExpr {
  kind: "MemberExpr";
  object: ASTNode;
  property: string;
  line: number;
}

export interface IndexExpr {
  kind: "IndexExpr";
  object: ASTNode;
  index: ASTNode;
  line: number;
}

export interface FnExpr {
  kind: "FnExpr";
  params: string[];
  body: BlockStmt;
  line: number;
}

// ── Literals ─────────────────────────────────────────────────

export interface Identifier {
  kind: "Identifier";
  name: string;
  line: number;
}

export interface NumberLiteral {
  kind: "NumberLiteral";
  value: number;
  line: number;
}

export interface StringLiteral {
  kind: "StringLiteral";
  value: string;
  line: number;
}

export interface BoolLiteral {
  kind: "BoolLiteral";
  value: boolean;
  line: number;
}

export interface NullLiteral {
  kind: "NullLiteral";
  line: number;
}

export interface ArrayLiteral {
  kind: "ArrayLiteral";
  elements: ASTNode[];
  line: number;
}

export interface ObjectLiteral {
  kind: "ObjectLiteral";
  properties: { key: string; value: ASTNode }[];
  line: number;
}
