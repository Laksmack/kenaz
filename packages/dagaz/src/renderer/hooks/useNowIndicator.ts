import { useState, useEffect } from 'react';
import { HOUR_HEIGHT } from '../lib/event-layout';

/**
 * Live-updating now indicator position.
 * Uses a single 60-second interval (matching calendar granularity).
 * Returns null when the view doesn't include today.
 */
export function useNowIndicator(isToday: boolean) {
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      if (!isToday) { setPosition(null); return; }
      const now = new Date();
      setPosition((now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT);
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [isToday]);

  return position;
}

/**
 * Week view variant: returns the pixel top AND the day index for the now line.
 * `weekStartDate` should be the Monday of the displayed week.
 */
export function useNowIndicatorWeek(weekStartDate: Date, numDays: number) {
  const [state, setState] = useState<{ top: number; dayIndex: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const weekStart = new Date(weekStartDate);
      weekStart.setHours(0, 0, 0, 0);
      const dayIndex = Math.floor((now.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
      if (dayIndex < 0 || dayIndex >= numDays) { setState(null); return; }
      const top = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT;
      setState({ top, dayIndex });
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [weekStartDate, numDays]);

  return state;
}
