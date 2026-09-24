import type {
  getGraphQuestionCoverage,
  getQuestionGraphBindings,
  listGraphConceptQuestions,
} from "@/services/question-graph-bindings/service";

export type GraphQuestionCoverage = Awaited<
  ReturnType<typeof getGraphQuestionCoverage>
>;
export type GraphQuestionPoint = GraphQuestionCoverage["points"][number];
export type GraphConceptQuestions = Awaited<
  ReturnType<typeof listGraphConceptQuestions>
>;
export type QuestionGraphBindingState = Awaited<
  ReturnType<typeof getQuestionGraphBindings>
>;
