/**
 * M3 navigation bar: Home · Create (+) · Profile. Shown on top-level screens only.
 */
import React from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { House, Plus, UserRound } from "lucide-react";
import { cx } from "../lib/utils.js";

const ITEMS = [
  { to: "/", label: "nav.home", icon: House, end: true },
  { to: "/create", label: "nav.create", icon: Plus, create: true },
  { to: "/profile", label: "nav.profile", icon: UserRound },
];

export default function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav className="fc-navbar fixed bottom-0 left-0 right-0 z-30" aria-label={t("nav.aria")}>
      <div className="mx-auto max-w-md flex fc-gutter">
        {ITEMS.map(({ to, label, icon: Icon, end, create }) => (
          <NavLink key={to} to={to} end={end} className={cx("fc-nav-item", create && "fc-nav-create")}>
            {({ isActive }) => (
              <>
                <span className="fc-nav-pill">
                  <Icon size={24} strokeWidth={isActive || create ? 2.25 : 1.75} />
                </span>
                <span className={isActive ? "font-bold" : undefined}>{t(label)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
