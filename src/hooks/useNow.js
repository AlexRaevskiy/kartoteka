import { useEffect, useState } from "react";

/** Current time, refreshed every minute and when the app returns to the foreground (midnight rollover). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return now;
}
