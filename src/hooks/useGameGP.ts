import { useState, useCallback } from "react";
import { fetchSponsorPoints, sponsorGameAction } from "../api/sponsor";
import type { MobileSession } from "../types/domain";

export const useGameGP = (session: MobileSession | null) => {
  const [gpBalance, setGpBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setLoading(true);
      const data = await fetchSponsorPoints(session);
      setGpBalance(data.green_points);
    } catch {
      // keep stale value
    } finally {
      setLoading(false);
    }
  }, [session]);

  const spend = useCallback(
    async (amount: number, action: string, gameId: string): Promise<boolean> => {
      if (!session || gpBalance < amount) return false;
      try {
        const result = await sponsorGameAction(session, { game_id: gameId, action, gp_delta: -amount });
        setGpBalance(result.new_balance);
        return true;
      } catch {
        return false;
      }
    },
    [session, gpBalance],
  );

  const earn = useCallback(
    async (amount: number, action: string, gameId: string): Promise<number> => {
      if (!session || amount <= 0) return 0;
      try {
        const result = await sponsorGameAction(session, { game_id: gameId, action, gp_delta: amount });
        setGpBalance(result.new_balance);
        return result.gp_delta;
      } catch {
        return 0;
      }
    },
    [session],
  );

  return { gpBalance, setGpBalance, loading, refresh, spend, earn };
};
