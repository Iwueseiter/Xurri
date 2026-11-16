'use client';

import { useState } from 'react';
import { Check, CloudUpload } from 'lucide-react';
import Link from 'next/link';
import { hasCeloForGas } from '@/lib/access';
import { chainConfig } from '@/lib/chain/config';
import { useWalletStore } from '@/lib/chain/wallet-store';
import { useGameStore } from '@/lib/game-store';
import { toast } from '@/lib/toast-store';

/** "Save to leaderboard" on the results card: one small CELO transaction puts the score on this week's board. */
export function SaveScore() {
  const result = useGameStore((s) => s.result);
  const saveScore = useGameStore((s) => s.saveScore);
  const celoBalance = useWalletStore((s) => s.chainState?.celoBalance);
  const [saving, setSaving] = useState(false);

  if (!chainConfig.playsAddress || !result || result.offline || result.rejected) return null;

  if (result.saved) {
    return (
      <p className="save-score saved" role="status">
        <Check size={16} /> Saved to the leaderboard{result.rank ? ` · #${result.rank} this week` : ''}
      </p>
    );
  }
  if (result.score <= 0) return null;

  const noCelo = celoBalance !== null && celoBalance !== undefined && !hasCeloForGas(celoBalance);
  if (noCelo) {
    return (
      <p className="save-score">
        Add a little CELO to save scores to the leaderboard. <Link href="/gas">Get CELO</Link>
      </p>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await saveScore();
    } catch (error) {
      toast.error('Couldn’t save your score', error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="save-score">
      <button type="button" className="btn btn-gold btn-block" onClick={save} disabled={saving}>
        {saving ? <span className="spinner" /> : <CloudUpload size={18} />}
        {saving ? 'Saving…' : 'Save to leaderboard'}
      </button>
      <span>Costs a tiny CELO network fee</span>
    </div>
  );
}
