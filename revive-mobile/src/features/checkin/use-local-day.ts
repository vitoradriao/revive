import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localDateKey } from '@/domain/formats';
import { dateInZone } from '@/domain/urge-time';

export function useLocalDay(timezone?: string) {
  const [state, setState] = useState(() => ({ timezone, day: timezone ? dateInZone(new Date(), timezone) : localDateKey() }));
  useEffect(() => {
    const update = () => {
      const day = timezone ? dateInZone(new Date(), timezone) : localDateKey();
      setState(previous => previous.day === day && previous.timezone === timezone ? previous : { timezone, day });
    };
    update();
    // Covers midnight and timezone changes while the form remains open.
    const timer = setInterval(update, 30_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') update();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [timezone]);
  return state.timezone === timezone ? state.day : timezone ? dateInZone(new Date(), timezone) : localDateKey();
}
