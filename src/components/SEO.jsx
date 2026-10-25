/**
 * Per-screen <title>, description, Open Graph and Twitter Card tags (react-helmet-async).
 * index.html keeps the same tags as a fallback for crawlers that don't run JavaScript.
 */
import React from "react";
import { Helmet } from "react-helmet-async";

// The static fallback tags in index.html are for crawlers without JavaScript. Once the app runs,
// drop them so every screen has exactly one description / og:* / twitter:* (React 19 hoists
// <Helmet> tags into <head> but does not replace tags that were already there).
if (typeof document !== "undefined") document.head.querySelectorAll("[data-seo-fallback]").forEach((el) => el.remove());

export const SITE_NAME = "Kartoteka";
export const DEFAULT_TITLE = "Kartoteka - Умные флеш-карточки по методу Лейтнера";
export const DEFAULT_DESCRIPTION =
  "Учите слова с флеш-карточками по методу Лейтнера: интервальное повторение показывает каждую карточку именно тогда, когда вы начинаете её забывать. Работает офлайн и синхронизируется между устройствами.";

export default function SEO({ title = DEFAULT_TITLE, description, type = "website", noindex = false }) {
  const desc = (description || DEFAULT_DESCRIPTION).replace(/\s+/g, " ").trim().slice(0, 300);
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={desc} />
      {noindex ? <meta name="robots" content="noindex" /> : null}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={desc} />
      <meta property="og:type" content={type} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={desc} />
    </Helmet>
  );
}
