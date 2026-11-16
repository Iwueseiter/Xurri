import type {
  LeaderboardResponse,
  PlayerSnapshot,
  RoundFinishResponse,
  RoundStartResponse,
  VoucherResponse,
} from '@/lib/types';
import type { TapLogEntry } from '@/lib/game-rules';

export class ApiError extends Error {
  constructor(
    message: string,
    /** The wallet must sign once to prove it's the player's before this can go through. */
    readonly needsProof = false,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; needsProof?: boolean };
  if (!response.ok) throw new ApiError(payload.error ?? `Request failed (${response.status})`, payload.needsProof === true);
  return payload;
}

export const api = {
  me: () => request<PlayerSnapshot>('/api/me'),
  updateMe: (body: { name?: string; email?: string }) => request<PlayerSnapshot>('/api/me', { method: 'PATCH', body }),
  nonce: (address: string) => request<{ message: string }>('/api/auth/nonce', { method: 'POST', body: { address } }),
  connectWallet: (address: string) => request<PlayerSnapshot>('/api/auth/connect', { method: 'POST', body: { address } }),
  verify: (address: string, signature: string) =>
    request<PlayerSnapshot>('/api/auth/verify', { method: 'POST', body: { address, signature } }),
  logout: () => request<PlayerSnapshot>('/api/auth/logout', { method: 'POST' }),
  emailLink: (email: string) => request<{ ok: true }>('/api/auth/email', { method: 'POST', body: { email } }),
  verifyOtp: (didToken: string) =>
    request<PlayerSnapshot>('/api/auth/email/verify', { method: 'POST', body: { didToken } }),
  startRound: () => request<RoundStartResponse>('/api/game/start', { method: 'POST', body: {} }),
  saveRound: (roundId: string, txHash: string) =>
    request<{ rank: number | null; player: PlayerSnapshot }>('/api/game/save', { method: 'POST', body: { roundId, txHash } }),
  finishRound: (roundId: string, log: TapLogEntry[]) =>
    request<RoundFinishResponse & { rejected?: string }>('/api/game/finish', { method: 'POST', body: { roundId, log } }),
  leaderboard: () => request<LeaderboardResponse>('/api/leaderboard'),
  recordDailyClaim: (txHash: string) => request<PlayerSnapshot>('/api/rewards/daily', { method: 'POST', body: { txHash } }),
  voucher: () => request<VoucherResponse>('/api/rewards/voucher', { method: 'POST' }),
  demoClaim: () => request<{ amount: number; player: PlayerSnapshot }>('/api/demo', { method: 'POST', body: { action: 'claim' } }),
  demoBuy: (slug: string) => request<{ player: PlayerSnapshot }>('/api/demo', { method: 'POST', body: { action: 'buy', slug } }),
  demoBoost: (amount: number) => request<{ player: PlayerSnapshot }>('/api/demo', { method: 'POST', body: { action: 'boost', amount } }),
};
