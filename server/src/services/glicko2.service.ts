const SCALE = 173.7178;
const TAU = 0.5;
const EPSILON = 1e-6;

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;
export const PROVISIONAL_THRESHOLD = 150;

export interface Glicko2Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface Glicko2GameResult {
  opponentRating: number;
  opponentRd: number;
  score: number; // 1.0 win, 0.5 draw, 0.0 loss
}

/**
 * @param overrides - optional fields to override defaults
 * @returns a new rating with default values
 */
export function newRating(overrides: Partial<Glicko2Rating> = {}): Glicko2Rating {
  return {
    rating: DEFAULT_RATING,
    rd: DEFAULT_RD,
    volatility: DEFAULT_VOLATILITY,
    ...overrides,
  };
}

/**
 * @param player - the player's current rating
 * @returns true if RD is above the provisional threshold
 */
export function isProvisional(player: Glicko2Rating): boolean {
  return player.rd > PROVISIONAL_THRESHOLD;
}

// glicko-2 helper functions (see Glickman 2012)
function gFunc(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function eFunc(mu: number, muOpp: number, phiOpp: number): number {
  return 1 / (1 + Math.exp(-gFunc(phiOpp) * (mu - muOpp)));
}

/**
 * Applies one Glicko-2 rating period update. If results is empty, RD still
 * increases to reflect inactivity.
 *
 * @param player - current rating
 * @param results - games played this period
 * @returns updated rating
 */
export function updateRating(player: Glicko2Rating, results: Glicko2GameResult[]): Glicko2Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const vol = player.volatility;

  if (results.length === 0) {
    const newPhi = Math.sqrt(phi * phi + vol * vol);
    return {
      rating: player.rating,
      rd: Math.min(newPhi * SCALE, DEFAULT_RD),
      volatility: vol,
    };
  }

  // convert opponents to internal scale
  const opps = results.map(r => ({
    mu: (r.opponentRating - 1500) / SCALE,
    phi: r.opponentRd / SCALE,
    score: r.score,
  }));

  // step 3: compute estimated variance v
  let varSum = 0;
  for (const opp of opps) {
    const e = eFunc(mu, opp.mu, opp.phi);
    varSum += gFunc(opp.phi) * gFunc(opp.phi) * e * (1 - e);
  }
  const v = 1 / varSum;

  // step 4: compute estimated improvement delta
  let deltaSum = 0;
  for (const opp of opps) {
    deltaSum += gFunc(opp.phi) * (opp.score - eFunc(mu, opp.mu, opp.phi));
  }
  const delta = v * deltaSum;

  // step 5: update volatility (Illinois algorithm)
  const alpha = Math.log(vol * vol);

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const denom = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * denom * denom) - (x - alpha) / (TAU * TAU);
  };

  let A = alpha;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(alpha - k * TAU) < 0) {
      k++;
    }
    B = alpha - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }

  const newVol = Math.exp(A / 2);

  // step 6: update RD
  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

  // step 7: update rating
  let ratingSum = 0;
  for (const opp of opps) {
    ratingSum += gFunc(opp.phi) * (opp.score - eFunc(mu, opp.mu, opp.phi));
  }
  const newMu = mu + newPhi * newPhi * ratingSum;

  return {
    rating: newMu * SCALE + 1500,
    rd: newPhi * SCALE,
    volatility: newVol,
  };
}
