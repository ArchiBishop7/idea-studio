// Build a request view without changing the complete project archive.
// Raw student inputs and current constraints are deliberately never truncated.
export function compactRequestContext(context) {
  const { corrections, ...currentState } = context;
  return {
    correctionsFirst: corrections,
    currentState: {
      ...currentState,
      exploredCombinations: (context.exploredCombinations || []).map((entry) => ({
        id: entry.id,
        round: entry.round,
        clueIds: entry.clues.map((clue) => clue.id),
        question: entry.question,
        results: (entry.results || []).map((clue) => ({
          id: clue.id,
          title: clue.title,
          sourceIds: clue.sourceIds,
        })),
        note: entry.note,
        historicalOnly: true,
      })),
    },
  };
}
