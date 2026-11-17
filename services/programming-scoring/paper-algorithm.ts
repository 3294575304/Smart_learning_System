import { pythonLanguage } from "@codemirror/lang-python";
import type {
  ProgrammingCodeScoreReview,
  ProgrammingPaperScoreSuggestion,
} from "./schemas";

export const PROGRAMMING_PAPER_SCORE_ALGORITHM_VERSION =
  "intelligent-ai-three-dimension-v1";
export const PROGRAMMING_PAPER_SCORE_PROMPT_VERSION =
  "intelligent-ai-code-review-v1";

const WEIGHTS = {
  semantic: 0.5,
  structure: 0.3,
  commentConsistency: 0.2,
} as const;
const COMMENT_MISMATCH_PENALTY = 0.8;
const MAX_STRUCTURAL_NODES = 1_200;
const MAX_AST_DEPTH = 80;

const STRUCTURAL_NODE_NAMES = new Set([
  "Script",
  "FunctionDefinition",
  "ClassDefinition",
  "DecoratedStatement",
  "IfStatement",
  "WhileStatement",
  "ForStatement",
  "TryStatement",
  "WithStatement",
  "MatchStatement",
  "MatchClause",
  "ElseClause",
  "ExceptClause",
  "FinallyClause",
  "Body",
  "StatementGroup",
  "AssignStatement",
  "UpdateStatement",
  "DeleteStatement",
  "ReturnStatement",
  "YieldStatement",
  "RaiseStatement",
  "AssertStatement",
  "PassStatement",
  "BreakStatement",
  "ContinueStatement",
  "ExpressionStatement",
  "TypeDefinition",
  "CallExpression",
  "BinaryExpression",
  "UnaryExpression",
  "BooleanExpression",
  "CompareExpression",
  "ConditionalExpression",
  "LambdaExpression",
  "YieldExpression",
  "AwaitExpression",
  "ListComprehension",
  "SetComprehension",
  "DictionaryComprehension",
  "GeneratorExpression",
  "ListExpression",
  "SetExpression",
  "DictionaryExpression",
  "TupleExpression",
  "SubscriptExpression",
  "AttributeExpression",
  "NamedExpression",
  "SyntaxError",
]);

type PythonSyntaxNode = ReturnType<
  typeof pythonLanguage.parser.parse
>["topNode"];

interface StructuralNode {
  label: string;
  children: StructuralNode[];
  size: number;
}

function normalizedNodes(node: PythonSyntaxNode, depth = 0): StructuralNode[] {
  if (depth > MAX_AST_DEPTH)
    throw new Error("代码语法结构过深，无法计算智能 AI 判题参考分");

  const children: StructuralNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(...normalizedNodes(child, depth + 1));
  }

  const label = node.type.isError ? "SyntaxError" : node.name;
  if (!STRUCTURAL_NODE_NAMES.has(label)) return children;

  const size = 1 + children.reduce((sum, child) => sum + child.size, 0);
  if (size > MAX_STRUCTURAL_NODES)
    throw new Error("代码过长，暂时无法计算智能 AI 判题参考分");
  return [{ label, children, size }];
}

function structureSimilarity(studentCode: string, referenceCode: string) {
  const studentTree = normalizedNodes(
    pythonLanguage.parser.parse(studentCode).topNode,
  )[0];
  const referenceTree = normalizedNodes(
    pythonLanguage.parser.parse(referenceCode).topNode,
  )[0];
  if (!studentTree || !referenceTree) return 0;

  const memo = new WeakMap<StructuralNode, WeakMap<StructuralNode, number>>();
  function distance(left: StructuralNode, right: StructuralNode): number {
    const cached = memo.get(left)?.get(right);
    if (cached !== undefined) return cached;

    const rows = left.children.length + 1;
    const columns = right.children.length + 1;
    const costs = Array.from({ length: rows }, () =>
      Array<number>(columns).fill(0),
    );
    for (let row = 1; row < rows; row++)
      costs[row][0] = costs[row - 1][0] + left.children[row - 1].size;
    for (let column = 1; column < columns; column++)
      costs[0][column] =
        costs[0][column - 1] + right.children[column - 1].size * 0.6;

    for (let row = 1; row < rows; row++) {
      for (let column = 1; column < columns; column++) {
        const deleteCost = costs[row - 1][column] + left.children[row - 1].size;
        const insertCost =
          costs[row][column - 1] + right.children[column - 1].size * 0.6;
        const replaceCost =
          costs[row - 1][column - 1] +
          distance(left.children[row - 1], right.children[column - 1]);
        costs[row][column] = Math.min(deleteCost, insertCost, replaceCost);
      }
    }

    const renameCost = left.label === right.label ? 0 : 0.3;
    const result = renameCost + costs[rows - 1][columns - 1];
    const rightMemo = memo.get(left) ?? new WeakMap<StructuralNode, number>();
    rightMemo.set(right, result);
    memo.set(left, rightMemo);
    return result;
  }

  const maximumNodes = Math.max(studentTree.size, referenceTree.size);
  if (maximumNodes === 0) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      (1 - distance(studentTree, referenceTree) / maximumNodes) * 100,
    ),
  );
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateProgrammingPaperScore(
  review: ProgrammingCodeScoreReview,
  studentCode: string,
  referenceCode: string,
  maxScore: number,
  model: string,
): ProgrammingPaperScoreSuggestion {
  const importanceTotal = review.functionalPoints.reduce(
    (sum, item) => sum + item.importance,
    0,
  );
  const semantic =
    importanceTotal > 0
      ? (review.functionalPoints.reduce(
          (sum, item) => sum + item.importance * item.coverage,
          0,
        ) /
          importanceTotal) *
        100
      : (review.functionalPoints.reduce((sum, item) => sum + item.coverage, 0) /
          review.functionalPoints.length) *
        100;

  const mismatchedCommentCount = review.commentPairs.filter(
    (item) => !item.consistent,
  ).length;
  const commentEvidenceMissing = review.commentPairs.length === 0;
  const commentMismatchRatio = commentEvidenceMissing
    ? 0
    : mismatchedCommentCount / review.commentPairs.length;
  const commentConsistency =
    (1 - COMMENT_MISMATCH_PENALTY * commentMismatchRatio) * 100;
  const structure = structureSimilarity(studentCode, referenceCode);
  const scoreOnHundred = roundScore(
    WEIGHTS.semantic * semantic +
      WEIGHTS.structure * structure +
      WEIGHTS.commentConsistency * commentConsistency,
  );

  return {
    algorithmVersion: PROGRAMMING_PAPER_SCORE_ALGORITHM_VERSION,
    promptVersion: PROGRAMMING_PAPER_SCORE_PROMPT_VERSION,
    model,
    score: roundScore((scoreOnHundred / 100) * maxScore),
    scoreOnHundred,
    maxScore,
    weights: WEIGHTS,
    dimensions: {
      semantic: roundScore(semantic),
      structure: roundScore(structure),
      commentConsistency: roundScore(commentConsistency),
    },
    functionalPointCount: review.functionalPoints.length,
    checkedCommentCount: review.commentPairs.length,
    mismatchedCommentCount,
    commentEvidenceMissing,
    review,
  };
}
