/**
 * Google Analytics 4 (react-ga4). Off unless VITE_GA_MEASUREMENT_ID is set at build time,
 * so local builds and forks without an ID send nothing.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ReactGA from "react-ga4";

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
export const analyticsEnabled = !!MEASUREMENT_ID;

let initialized = false;

export function initAnalytics() {
  if (!analyticsEnabled || initialized) return;
  initialized = true;
  // The SPA reports page views itself (usePageTracking); stop gtag from sending a duplicate first one.
  ReactGA.initialize(MEASUREMENT_ID, { gtagOptions: { send_page_view: false } });
}

/** Sends a page_view on every route change. Must be used inside the router. */
export function usePageTracking() {
  const location = useLocation();
  useEffect(() => {
    if (!analyticsEnabled) return;
    initAnalytics();
    ReactGA.send({ hitType: "pageview", page: location.pathname });
  }, [location.pathname]);
}
