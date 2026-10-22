/**
 * PWA install helpers.
 *  - Android / desktop Chrome & Edge fire `beforeinstallprompt`: we keep it and show our own Install button.
 *  - iOS Safari has no install API: we show "Share → Add to Home Screen" instructions instead.
 */
import { useEffect, useState } from "react";
import { isIOS, isStandalone } from "../lib/utils.js";

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault(); // stop the mini-infobar; we show our own button
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    setDeferred(null);
    return choice?.outcome === "accepted";
  };

  return {
    installed,
    canInstall: !!deferred && !installed,
    showIOSHint: isIOS() && !installed,
    promptInstall,
  };
}
