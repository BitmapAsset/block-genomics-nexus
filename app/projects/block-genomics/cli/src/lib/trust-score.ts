export type TrustFactors = {
  signature: number;
  ownership: number;
  age: number;
  history: number;
  format: number;
  endorsements: number;
};

const WEIGHTS: TrustFactors = {
  signature: 0.25,
  ownership: 0.25,
  age: 0.15,
  history: 0.15,
  format: 0.1,
  endorsements: 0.1,
};

export function computeTrustScore(factors: TrustFactors): number {
  const score =
    factors.signature * WEIGHTS.signature +
    factors.ownership * WEIGHTS.ownership +
    factors.age * WEIGHTS.age +
    factors.history * WEIGHTS.history +
    factors.format * WEIGHTS.format +
    factors.endorsements * WEIGHTS.endorsements;
  return Math.round(score * 100);
}

export function mockTrustFactors(): TrustFactors {
  return {
    signature: 0.9,
    ownership: 0.85,
    age: 0.7,
    history: 0.8,
    format: 0.95,
    endorsements: 0.6,
  };
}
