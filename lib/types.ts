export type PlayerSnapshot = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  address: string | null;
  /** Email the player signs in with (magic link), if any. */
  signedInEmail: string | null;
  /** False for a wallet session that hasn't proved it owns the wallet yet (no signature or transaction). */
  accountProven: boolean;
  /** Days in a row of GoodDollar daily claims, and GoodDollar's day number of the last one. */
  claimStreak: number;
  claimDay: number;
  bestScore: number;
  weeklyBest: number;
  gamesPlayed: number;
  totalScore: number;
  roundsLeft: number;
  maxRounds: number;
  /** Total G$ won in tournaments (wallet players only). */
  earned: number;
  banned: boolean;
  demo: {
    balance: number;
    purchases: string[];
    claimedToday: boolean;
    streak: number;
  };
};

export type LeaderboardRow = {
  rank: number;
  name: string;
  score: number;
  isYou: boolean;
  verifiedWallet: boolean;
};

export type LeaderboardResponse = {
  weekKey: string;
  resetsInMs: number;
  /** G$ for each place this week, first place first, including what's been boosted in. */
  prizes: number[];
  /** This week's pot: the base prizes plus G$ added by players and sponsors. */
  pot: { total: number; boosted: number };
  rows: LeaderboardRow[];
  you: LeaderboardRow | null;
  lastWeek: {
    weekKey: string;
    winners: { rank: number; name: string; score: number; prize: number; isYou: boolean }[];
  } | null;
};

export type RoundStartResponse = {
  roundId: string;
  seed: number;
  ranked: boolean;
  player: PlayerSnapshot;
};

export type RoundFinishResponse = {
  score: number;
  ranked: boolean;
  /** This week's tournament place after the round, when it counted. */
  rank: number | null;
  newBest: boolean;
  player: PlayerSnapshot;
};

export type VoucherResponse = {
  cumulativeAmount: string;
  deadline: string;
  signature: `0x${string}`;
};
