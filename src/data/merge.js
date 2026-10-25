/**
 * A guest tried to link a Google account that already has its own data.
 * Sign into that Google account and copy the guest's own decks (with Leitner progress)
 * and folders into it, so nothing studied as a guest is lost.
 */
import { AlertTriangle, Sparkles } from "lucide-react";
import { buildBackup, readBackup } from "../lib/backup.js";
import { restoreInto } from "./LibraryProvider.jsx";
import i18n from "../i18n/index.js";

export async function mergeGuestInto(auth, lib, credential, toast) {
  const own = lib.decks.filter((d) => d.own);
  let snapshot = null;
  try {
    snapshot = readBackup(buildBackup({ user: auth.user, profile: lib.profile, decks: own, library: lib.library, folders: lib.folders }));
  } catch {
    snapshot = null; // nothing to copy
  }
  try {
    const result = await auth.signInWithExistingCredential(credential);
    if (snapshot) await restoreInto(result.user.uid, result.user.displayName || i18n.t("library.user"), snapshot);
    toast(own.length ? i18n.t("merge.signedInWithSets", { count: own.length }) : i18n.t("merge.signedIn"), { icon: Sparkles, duration: 6000 });
  } catch (err) {
    toast(err?.message || i18n.t("merge.failed"), { icon: AlertTriangle, duration: 6000 });
  }
}
