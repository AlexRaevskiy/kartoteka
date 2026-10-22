# Kartoteka — Leitner flashcards (PWA)

Spaced-repetition flashcards with a 5-box Leitner system, synced through Firebase and installable on iPhone, Android and desktop.

- **Study modes:** flip cards (tap, keys or swipe), multiple-choice quiz, and a smart Write mode that uses Levenshtein distance to spot typos, highlight the exact letters, offer a retry and give partial credit
- **Cards** have a term, a definition and an optional example sentence. The sentence shows on the back of the card, after a quiz answer, or as a hint in Write mode, with the term blanked out when it's the answer.
- **Reverse mode:** study Definition → Term
- **Quick Import:** paste `term — definition — example` lines, or open a .txt/.csv file
- **Cloud sync** through Firestore, with real-time listeners and an offline cache. Sign in with Google, or try it as a guest and link Google later.
- **Export** everything (decks plus Leitner progress) as JSON, and **restore** it from a backup
- **PWA:** installable, works offline, and shows an "update available" prompt after each deploy

---

## 1. Project structure

```
kartoteka/
├─ index.html                 iOS/Android PWA meta tags, theme colour
├─ vite.config.js             Vite + React + Tailwind v4 + vite-plugin-pwa (manifest + service worker)
├─ netlify.toml               build settings, SPA redirect (no 404 on refresh), cache headers
├─ firestore.rules            database security rules (paste into Firebase console)
├─ .env.example               Firebase config variables
├─ public/                    icons: favicon.svg, pwa-192/512, maskable-512, apple-touch-icon-180
├─ tests/logic.test.js        unit tests for Leitner, Levenshtein, parser, backup (npm test)
└─ src/
   ├─ main.jsx                entry, fonts, error boundary
   ├─ App.jsx                 app shell: auth gate, workspace, export/restore, guest → Google
   ├─ firebase.js             Firebase init (Auth + Firestore with offline cache)
   ├─ index.css               design tokens (light/dark) + component classes
   ├─ data/
   │  ├─ store.js             the only file that talks to Firestore
   │  ├─ useAuth.js           Google / guest sign-in, account linking
   │  └─ useLibrary.js        live decks + settings, optimistic writes, sync status
   ├─ hooks/                  useStudySession (queue engine), useInstallPrompt
   ├─ lib/
   │  ├─ leitner.js           box intervals, grading, due dates, stats
   │  ├─ levenshtein.js       edit distance + alignment, typo tolerance, answer variants
   │  ├─ parser.js            Quick Import parser (2 or 3 columns)
   │  ├─ backup.js            JSON export / restore (also reads v1 front/back backups)
   │  ├─ model.js             data model, limits, v1 → v2 migration
   │  └─ speech.js, celebrate.js, utils.js
   └─ components/
      ├─ study/               StudyShell, FlashcardMode, QuizMode, WriteMode, DiffView
      ├─ Header, DeckRail, BoxProgress, CardsManager, ImportDialog, PwaPrompts, screens, ui
```

### Firestore data model

```
users/{uid}                  { settings: { reverse, theme, activeDeckId, installHintDismissed }, log: { "2026-10-14": 23 } }
users/{uid}/decks/{deckId}   { name, description, createdAt, updatedAt,
                               cards: [{ id, term, definition, exampleSentence, box, lastReviewed, reviews, lapses, createdAt }] }
```

Each deck's cards live inside the deck document, so loading a deck costs **one read**. That keeps you well inside the free Spark plan. Each deck is capped at 2,000 cards so the document stays under Firestore's 1 MB limit.

---

## 2. Firebase setup (one time, about 10 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** → name it (e.g. `kartoteka`). Google Analytics is optional.
2. **Register a web app:** Project overview → **</>** (Web) → nickname `kartoteka-web` → *Register app*. Leave "Firebase Hosting" unchecked, because Netlify hosts the app. Keep the `firebaseConfig` values it shows you.
3. **Authentication:** Build → Authentication → *Get started* → Sign-in method:
   - enable **Google** (choose a support email) → Save
   - enable **Anonymous** → Save
4. **Firestore:** Build → Firestore Database → *Create database* → pick the location closest to you (e.g. `eur3` for Europe) → **Start in production mode**.
5. **Rules:** in Firestore → **Rules**, replace everything with the contents of `firestore.rules` → **Publish**.

---

## 3. Run it locally

You need **Node.js 20.19+ (22 LTS recommended)** and Git.

```bash
cd kartoteka
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
# open .env.local and paste the six values from firebaseConfig
npm run dev                       # → http://localhost:5173
```

`localhost` is an authorized sign-in domain by default, so Google sign-in works right away.

To test the real PWA (service worker, offline mode, install prompt), use a production build:

```bash
npm run build && npm run preview  # → http://localhost:4173
npm test                          # unit tests for the core logic
```

---

## 4. Deploy to Netlify (free)

### Option A: from GitHub (recommended, deploys automatically on every push)

```bash
git init
git add .
git commit -m "Kartoteka PWA"
# create an empty repo on github.com named "kartoteka", then:
git remote add origin https://github.com/<your-username>/kartoteka.git
git branch -M main
git push -u origin main
```

1. Sign in at <https://app.netlify.com> (you can use your GitHub account) → **Add new project → Import an existing project → GitHub** → choose `kartoteka`.
2. The build settings are read from `netlify.toml` (`npm run build`, publish folder `dist`, Node 22). Leave them as they are.
3. Under **Environment variables**, add the six `VITE_FIREBASE_*` variables with the same values as in your `.env.local`.
4. Click **Deploy**. After about a minute you get a URL like `https://kartoteka-abc123.netlify.app`. You can rename it under *Site configuration → Change site name*.

### Option B: Netlify CLI (no GitHub)

```bash
npm install -g netlify-cli
netlify login
netlify init                      # "Create & configure a new project"
netlify env:set VITE_FIREBASE_API_KEY "..."      # repeat for all six variables
netlify deploy --build --prod
```

### Then, in Firebase

**Authentication → Settings → Authorized domains → Add domain** → `kartoteka-abc123.netlify.app` (plus any custom domain). Without this, Google sign-in fails with `auth/unauthorized-domain`.

### Changing environment variables later

Vite bakes the variables into the build, so after changing them in Netlify, run **Deploys → Trigger deploy → Clear cache and deploy site**.

---

## 5. Install on your phone

- **iPhone / iPad:** open the site in **Safari** → **Share** → **Add to Home Screen** → Add. The app also shows these instructions in a banner.
- **Android:** open it in Chrome → tap the **Install** button in the app's banner, or ⋮ → **Install app**.
- **Desktop Chrome / Edge:** use the install icon in the address bar, or account menu → *Install app*.

On iOS the installed app has its own storage, separate from Safari, so you sign in once more inside it. Your decks come from the cloud.

### Making Google sign-in reliable on iPhone (optional, recommended)

Safari blocks the third-party storage that Firebase's default sign-in redirect relies on. The fix is to serve Firebase's auth handler from your own domain:

1. In `netlify.toml`, uncomment the `/__/auth/*` redirect block and replace `YOUR-PROJECT-ID`.
2. In Netlify, set `VITE_FIREBASE_AUTH_DOMAIN` to your Netlify domain (e.g. `kartoteka-abc123.netlify.app`).
3. Go to Google Cloud Console → APIs & Services → Credentials → *Web client (auto created by Google Service)* → **Authorized redirect URIs**, and add `https://kartoteka-abc123.netlify.app/__/auth/handler`.
4. Redeploy.

Guest mode works everywhere without this step.

---

## 6. Customising

| What | Where |
|---|---|
| Box intervals (1/2/4/8 days), what "almost" does | `src/lib/leitner.js` → `BOX_INTERVAL_DAYS`, `PARTIAL_CREDIT_POLICY` |
| How many typos count as "almost", ignore accents | `src/lib/levenshtein.js` → `typoTolerance()`, `IGNORE_ACCENTS` |
| Import separators | `src/lib/parser.js` → `PRIMARY_SEPARATORS` |
| Colours, fonts, dark theme | `src/index.css` (tokens at the top) + `vite.config.js` `BRAND` |
| Cards per deck limit | `src/lib/model.js` → `MAX_CARDS_PER_DECK` (keep in sync with `firestore.rules`) |
| Swipe sensitivity | `src/components/study/FlashcardMode.jsx` → `SWIPE_THRESHOLD` |
| App icons | replace the PNGs in `public/` (same names and sizes) |

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| "Connect Firebase" screen | The `VITE_FIREBASE_*` variables are missing. Add them, then redeploy with *Clear cache and deploy*. |
| `auth/unauthorized-domain` | Add the domain in Firebase → Authentication → Settings → Authorized domains. |
| `auth/operation-not-allowed` | Enable Google and Anonymous under Authentication → Sign-in method. |
| "The database refused access" | Publish `firestore.rules` (step 2.5). |
| Netlify build fails with "secrets scanning" | Firebase web keys are public by design. `netlify.toml` already sets `SECRETS_SCAN_OMIT_KEYS`. If smart detection still flags the API key, add the env var `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` set to your API key value. |
| Refreshing a page gives a 404 | Make sure `netlify.toml` is in the repo root (it has the SPA redirect). |
| Phone still shows an old version | The app shows "A new version is ready → Reload". Closing and reopening the installed app also updates it. |
| Guest decks vanished after sign-out | Guest accounts can't be recovered. Use *Save to a Google account* or *Export data* before signing out (the app warns you). |

### Free-tier notes

Firebase's free Spark plan includes a daily Firestore quota (about 50,000 reads and 20,000 writes per day at the time of writing). Each rated card is one write, plus one for the daily streak counter, which is far more than one person studies. Netlify's free plan easily covers a personal static app.
