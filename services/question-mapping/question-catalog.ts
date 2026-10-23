export interface MappingCatalogSource {
  id: string;
  title: string;
  type: string;
  difficulty: number;
  graphBindingSets: Array<{ id: string }>;
}

export function buildMappingQuestionCatalog(questions: MappingCatalogSource[]) {
  return questions.map((question) => ({
    id: question.id,
    title: question.title,
    type: question.type,
    difficulty: question.difficulty,
    isBound: question.graphBindingSets.length > 0,
    bindingQuestionId: question.id,
  }));
}
