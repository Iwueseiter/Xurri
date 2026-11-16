'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Flame, Gift } from 'lucide-react';
import Link from 'next/link';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { FaceVerifyButton } from '@/components/wallet/FaceVerifyButton';
import { StreakTrack } from '@/components/wallet/StreakTrack';
import { playSound } from '@/lib/audioManager';
import { chainConfig } from '@/lib/chain/config';
import { describeError, useWalletStore } from '@/lib/chain/wallet-store';
import { formatDuration, formatG } from '@/lib/format';
import { usePlayerStore } from '@/lib/player-store';
import { toast } from '@/lib/toast-store';

/**
 * GoodDollar's daily claim (UBI). Verified people can claim G$ once a day from GoodDollar's UBIScheme
 * contract; Xurri gives them the button and keeps their streak of days in a row.
 */
export function UbiClaim({ compact = false }: { compact?: boolean }) {
  const { account, ubi, ubiChecked, claimUbi, refreshUbi, busy } = useWalletStore();
  const player = usePlayerStore((s) => s.player);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (account) void refreshUbi();
  }, [account, refreshUbi]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Hide on networks without GoodDollar's contracts, or when they can't be reached.
  if (!chainConfig.ubiAddress || (account && !ubi && ubiChecked)) return null;

  // The streak stays alive while the last claim was today or yesterday (GoodDollar days).
  const streak = ubi && player && player.claimDay >= ubi.day - 1 ? player.claimStreak : 0;

  const claim = async () => {
    try {
      const amount = await claimUbi();
      if (amount == null) throw new Error('Sign in with a verified wallet to claim G$.');
      playSound('score-milestone', 1);
      toast.success(`+${formatG(amount)} G$ claimed`, 'Come back tomorrow to keep your streak going.');
    } catch (error) {
      toast.error('Couldn’t claim', describeError(error));
    }
  };

  // The home screen only shows the strip when there's something to claim right now.
  if (compact) {
    if (!account || !ubi || !ubi.verified || ubi.claimedToday) return null;
    return (
      <button type="button" className="ubi-strip" onClick={claim} disabled={Boolean(busy)}>
        <span className="ubi-strip-icon">
          <Gift size={18} />
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <strong>Your daily G$ is ready</strong>
          <small>{streak > 0 ? `${streak}-day streak · keep it going` : `${formatG(ubi.amount)} G$ from GoodDollar`}</small>
        </span>
        <span className="ubi-strip-cta">Claim</span>
      </button>
    );
  }

  return (
    <section className="panel ubi-card">
      <div className="ubi-head">
        <span className="ubi-badge">G$</span>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">GoodDollar daily claim</p>
          <h2 className="title-md">Claim G$ every day</h2>
        </div>
        {ubi?.verified && (
          <span className="ubi-streak num" aria-label={`${streak}-day streak`}>
            <Flame size={16} /> {streak}
          </span>
        )}
      </div>

      {!account ? (
        <>
          <p className="panel-copy">Every verified person can claim G$ from GoodDollar once a day. Sign in with your wallet to claim it here.</p>
          <div style={{ marginTop: 14 }}>
            <ConnectButton block label="Sign in with wallet" />
          </div>
        </>
      ) : !ubi ? (
        <div className="skeleton" style={{ height: 52, marginTop: 14 }} />
      ) : !ubi.verified ? (
        <>
          <p className="panel-copy">
            GoodDollar pays real people. Verify your face once with this wallet, then come back here to claim every day.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
            <Link href="/gooddollar-verification" style={{ color: 'var(--orange)', fontWeight: 700 }}>
              How face verification works
            </Link>
          </p>
          <div style={{ marginTop: 14 }}>
            <FaceVerifyButton />
          </div>
        </>
      ) : (
        <>
          <StreakTrack streak={streak} claimedToday={ubi.claimedToday} />
          {ubi.claimedToday ? (
            <p className="ubi-done">
              <BadgeCheck size={18} /> Claimed today · next claim in {formatDuration(ubi.nextClaimAt - now)}
            </p>
          ) : (
            <>
              <p className="ubi-amount num">
                {formatG(ubi.amount)} <span>G$ waiting for you</span>
              </p>
              <button type="button" className="btn btn-primary btn-block" onClick={claim} disabled={Boolean(busy)}>
                Claim today’s G$
              </button>
              <p className="ubi-note">
                {streak > 0 ? `Day ${streak + 1} of your streak. ` : ''}Paid by GoodDollar. You pay a tiny CELO network fee.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
