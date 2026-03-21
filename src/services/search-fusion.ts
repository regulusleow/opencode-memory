export interface RankedResult {
  id: string;
  rank: number;
}

export function rrfFuse(layers: RankedResult[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const layer of layers) {
    for (const { id, rank } of layer) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return scores;
}

export function applyPostRRFBonus(
  fusedScores: Map<string, number>,
  bonuses: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [id, score] of fusedScores) {
    result.set(id, score + (bonuses.get(id) ?? 0));
  }
  return result;
}
