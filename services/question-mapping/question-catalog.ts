export interface MappingCatalogSource {
  id: string;
  title: string;
  type: string;
  graphBindingSets: Array<{ id: string }>;
}

export function buildMappingQuestionCatalog(questions: MappingCatalogSource[]) {
  return questions.map((question) => ({
    id: question.id,
    title: question.title,
    type: question.type,
    isBound: question.graphBindingSets.length > 0,
    bindingQuestionId: question.id,
  }));
}
