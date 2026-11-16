import { Coins } from 'lucide-react';

/** A week of daily claims: done days filled in, today's highlighted. Day 8 starts a fresh row of 7. */
export function StreakTrack({ streak, claimedToday }: { streak: number; claimedToday: boolean }) {
  const offset = Math.floor(Math.max(0, claimedToday ? streak - 1 : streak) / 7) * 7;
  return (
    <div className="streak-track">
      {Array.from({ length: 7 }, (_, i) => {
        const day = offset + i + 1;
        const done = day <= streak;
        const next = !claimedToday && day === streak + 1;
        return (
          <div key={day} className={`streak-day ${done ? 'done' : ''} ${next ? 'next' : ''}`}>
            <Coins size={14} />
            Day {day}
          </div>
        );
      })}
    </div>
  );
}
