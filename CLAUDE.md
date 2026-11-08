# CLAUDE.md — Kartoteka

> Системный контекст для агента. Перед изменениями прочитай этот файл целиком.
> Описано состояние ветки `main` на коммите `6170a17` («Intro gate counts only fresh words…»).

---

## 1. Project Overview & Stack

**Kartoteka** — PWA для изучения слов на карточках по системе Лейтнера.
- Основные пары языков: грузинский/английский ↔ русский.
- Mobile-first: приложение ставят на экран «Домой» на iPhone и Android.
- Интерфейс на двух языках: `ru` и `en`.

| Слой | Технология |
|---|---|
| UI | React 19, Vite 8 (Rolldown), React Router 7 (`src/App.jsx`) |
| Стили | Tailwind CSS v4, настройка в `src/index.css` через `@theme` (отдельного `tailwind.config.js` нет). Material Design 3: шрифт Roboto Flex, цветовые токены `--md-*` |
| Иконки | lucide-react |
| Авторизация | Firebase Auth: Google, Apple (включается флагом `VITE_APPLE_SIGN_IN=true`), email + пароль, Anonymous («гость»). Google и Apple — **только popup** (`src/data/useAuth.js`) |
| База данных | Cloud Firestore с persistent local cache (`src/firebase.js`) |
| Озвучка | Netlify Function `netlify/functions/tts.js` по адресу **`POST /api/tts`** (`export const config = { path: "/api/tts" }`). Синтез — Azure Speech (у Google TTS нет грузинского голоса). Кэш — Firestore `audio_cache` + IndexedDB на устройстве |
| Офлайн-аудио | IndexedDB, база `kartoteka-audio`, хранилище `offlineAudio` (`src/data/offlineAudio.js`) |
| i18n | i18next + react-i18next (`src/i18n/`) |
| PWA | vite-plugin-pwa, стратегия `injectManifest`, свой service worker `src/sw.js` (precache + push) |
| Пуши | Firebase Cloud Messaging; рассылка — scheduled function `netlify/functions/send-reminders.mjs` (каждый час) |
| SEO / аналитика | react-helmet-async (`src/components/SEO.jsx`), GA4 через react-ga4 (`src/lib/analytics.js`, выключено без `VITE_GA_MEASUREMENT_ID`) |
| Хостинг | Netlify: SPA-redirect, Functions, переменные окружения |
| Тесты | `node --test tests/*.test.js` — 14 тестов чистой логики |

---

## 2. Architecture & Data Model

### 2.1 Структура

```
src/
  App.jsx                  маршруты + auth-гейт + провайдеры
  main.jsx                 BrowserRouter, HelmetProvider, шрифты, i18n
  screens/                 HomeScreen, FolderScreen, DeckScreen, EditorScreen, ProfileScreen, StudyScreen
  components/
    ui.jsx                 Sheet, Menu, TopBar, SpeakButton, ExampleBlock, Switch, ProgressBar…
    providers.jsx          useToast(), useDialogs() (confirm/prompt вместо window.*)
    sheets.jsx             Share / FolderPicker / Goal / Download / SetInfo
    AudioDownloadButton.jsx  «Скачать озвучку набора» для офлайна
    study/                 FlashcardMode, QuizMode, WriteMode, LearnMode, MatchMode, BlitzMode,
                           IntroSession, RoundSummary, DiffView, RatingHint,
                           AutoAudio.jsx (шестерёнка, шит настроек озвучки, «Нажмите, чтобы слушать»),
                           modes.js (MODES: id, иконка, minCards)
  hooks/                   useRounds, useStudyTimer, useAutoSpeak (авто-озвучка карточки)
  data/                    store.js — ЕДИНСТВЕННЫЙ модуль, импортирующий firebase/firestore
                           LibraryProvider.jsx (контекст useLibrary), useRemote.js, useAuth.js,
                           migrate.js, merge.js, tts.js (цепочка аудио), offlineAudio.js (IndexedDB)
  lib/                     чистая логика без React/Firebase: leitner, rounds, goals, levenshtein,
                           parser, reminders, model, tts (голоса и ключ кэша), speech (плеер), share,
                           autoSpeak (что и когда озвучивать), games (Match / Blitz)…
  i18n/                    index.js (init), format.js (переводимые форматтеры), locales/ru.json, en.json
  sw.js                    service worker
netlify/functions/         tts.js (/api/tts), send-reminders.mjs (cron)
firestore.rules            правила безопасности — менять вместе с моделью данных
tests/logic.test.js
```

### 2.2 Firestore

```
decks/{deckId}                 контент набора (общий, им можно делиться)
  ownerId, ownerName, title, description, termLang, defLang,
  visibility: public|password|private, editPolicy: owner|password,
  cards: [{ id, term, definition, exampleSentence }], cardCount, createdAt, updatedAt
deckStubs/{deckId}             публичная «обложка»: название, автор, тип доступа
deckSecrets/{deckId}           SHA-256(deckId:password), читает только владелец
decks/{deckId}/grants/{uid}    доступ по паролю (правила сверяют хэш, сервер не нужен)
folders/{folderId}             папки-метки: deckIds[], tags[{id,name,deckIds}], visibility
audio_cache/{sha256}           MP3 (base64) от /api/tts; клиент только get, пишет Admin SDK в функции
users/{uid}                    settings (вкл. autoAudio, dailyGoal, roundSize, notify…),
                               currentStreak, longestStreak, lastStudyDate, dailyProgress, fcmTokens, log
users/{uid}/library/{deckId}   ЛИЧНЫЙ прогресс: progress{cardId:{…}}, starred[], lastStudiedAt
users/{uid}/decks/{deckId}     LEGACY v2 — только для автомиграции (src/data/migrate.js), не писать сюда
```

### 2.3 Карточка

```js
// Контент — общий, decks/{id}.cards[]
{ id, term, definition, exampleSentence }      // exampleSentence необязателен, "" по умолчанию

// Прогресс — личный, users/{uid}/library/{deckId}.progress[cardId]
{ box: 1..5, lastReviewed: ms|null, reviews, lapses, introducedAt: ms|null }
```

- **Канонические поля — `term` / `definition`.** Поля `front` / `back` остались только в старых данных v1. `normalizeCardContent` (`src/lib/model.js`) их понимает. Новый код читает через нормализатор и **пишет только `term`/`definition`**.
- **Контент и прогресс не смешивать.**
  - Оценка пишет одно поле `progress.<cardId>`: `store.setCardProgress`, `setDoc(..., {merge:true})`.
  - Конец «Знакомства» пишет только `introducedAt`: `store.markIntroduced`.
- **`exampleSentence`:**
  - показывается на обороте карточки, после ответа в тесте и в режиме «Знакомство»;
  - в «Письме» служит подсказкой — термин маскируется через `splitOnTerm` в `src/lib/utils.js`;
  - при импорте пример задаётся разделителем ` // ` (`src/lib/parser.js`).

### 2.4 Лейтнер, 5 коробок (`src/lib/leitner.js`)

| Коробка | Интервал повтора |
|---|---|
| 1 | каждый день |
| 2 | 2 дня |
| 3 | 4 дня |
| 4 | 8 дней |
| 5 | выучено, в повторы не попадает |

- **Оценки:**
  - `know` → коробка +1;
  - `again` → коробка 1;
  - `almost` (опечатка, подсказка, вторая попытка) → коробка не меняется (`PARTIAL_CREDIT_POLICY`).
- **Даты** — по календарным дням в локальном времени, переход на летнее время учтён.
- **Цель `cram`** («Cram for a test»):
  - карточки берутся без учёта расписания;
  - верный ответ по карточке, которой ещё не пора, коробку **не повышает** (`nextProgress` возвращает `null`);
  - ошибка всё равно ведёт в коробку 1.
- **Только первый ответ** в обычном раунде меняет Лейтнер. Раунды «повтор ошибок» коробки не трогают.

**Статусы** (`progressCategory` в `model.js`, `progressBreakdown` в `leitner.js`):

| UI | Условие |
|---|---|
| `Not studied` | `lastReviewed == null && !introducedAt` |
| `Still learning` | изучалась **или прошла «Знакомство»** (`introducedAt` есть), коробка 1–4 |
| `Mastered` | `box === 5` |

**Роль `introducedAt`** (`src/lib/rounds.js`):
- `isNewCard(item)` = `lastReviewed == null`: карточку ещё ни разу не оценивали. Слова после «Знакомства» тоже считаются «новыми» для Лейтнера, но **идут первыми** в следующей сессии: `freshPortion` сортирует по `introducedAt`.
- `isUnseenCard(item)` = новая и без `introducedAt` — её ещё не показывали.
- **Порции:** одна сессия берёт не больше `MAX_NEW_PER_SESSION = 15` новых карточек в порядке набора (`buildPool(..., { newLimit })`). Следующая сессия продолжает с того же места.

### 2.5 Раунды, цели, стрик, пуши

- **Раунды** (`lib/rounds.js`, `hooks/useRounds.js`):
  - размер 10/20/30 (`settings.roundSize`, по умолчанию 20);
  - после раунда — `RoundSummary`;
  - «Продолжить» запускает раунд только из ошибок, а без ошибок — следующую порцию.
- **Цель дня** (`lib/goals.js`): `{type: "minutes"|"rounds", value}`. Время считается только активное (`hooks/useStudyTimer.js`, простой 90 с).
- **Стрик:** день засчитывается при **выполненной цели**.
- **Пуши** (`lib/reminders.js`, `PUSH_MESSAGES`):
  - приходят в выбранный локальный час, только если цель не выполнена;
  - функция ищет пользователей по `settings.notify.utcHours` (`array-contains`).

---

## 3. Critical Engineering Decisions (ВАЖНО — не «упрощать»)

### 3.1 Аудиоплеер и iOS Safari (`src/lib/speech.js`)

**Проблема.** iOS Safari, особенно в установленном PWA, запускает звук только синхронно внутри пользовательского жеста. Облачное аудио приходит позже, после `await` (IndexedDB, Firestore, сеть), — к этому моменту жест «потерян», и `play()` падает с `NotAllowedError`.

Ещё два ограничения iOS:
- звук может глушиться переключателем «Без звука»;
- элемент без `playsinline` пытается уйти в полноэкранный плеер.

**Как сделано сейчас (не менять без причины):**

1. **Один переиспользуемый элемент-синглтон**, созданный программно, а не JSX-тегом:
   ```js
   player = new Audio();
   player.preload = "auto";
   player.setAttribute("playsinline", "");
   ```
   - Каждое воспроизведение меняет `src` у **этого же** элемента.
   - Не создавать `new Audio()` на каждое слово и не добавлять `<audio>` в карточки: каждый новый элемент на iOS пришлось бы разблокировать заново.
2. **Audio Session API** (Safari 16.4+) — в `unlockAudio()`, с проверкой наличия:
   ```js
   if (navigator.audioSession) navigator.audioSession.type = "playback";
   ```
   Категория `playback` — как у музыкального приложения: звук идёт через динамик даже при включённом беззвучном режиме. Медиа-элементы и так используют её; вызов просит её явно.
3. **Синхронный анлок.** `speak()` и `speakSequence()` вызывают `unlockAudio()` **до первого `await`**:
   ```js
   audio.src = SILENCE;            // короткий беззвучный WAV в data: URI
   audio.play().catch(() => {});   // реальный клип прервёт эту тишину — так и задумано
   ```
   Отдельного `pause()` нет: настоящий клип подменяет `src` на том же элементе, когда готов. После этого элемент «доверенный», и `play()` после сетевого запроса проходит.
4. **Вызывать `speak` прямо из обработчика клика/тапа.**
   - В `IntroSession` автопроигрывание стартует синхронно в обработчиках Next/Back/свайпа.
   - Для первой карточки жеста нет: если iOS отказал (`blocked: true`), показывается подсказка «Нажмите, чтобы послушать».
5. **Отмена:** `playToken` отменяет устаревшие запросы, если пользователь уже нажал на другое слово; `stopSpeech()` вызывается при закрытии экрана.
6. **Авто-озвучка в режимах учёбы** (`hooks/useAutoSpeak.js`, правила — `lib/autoSpeak.js`):
   - карточка появилась → `speakStage(card, deck, "prompt")` из эффекта монтирования;
   - переворот / ответ → `speakStage(..., "answer")` прямо в обработчике тапа;
   - эффект вне жеста работает на iOS, потому что тап, который привёл к карточке, вызвал
     `primeAudio()` (= `stopSpeech()` + `unlockAudio()`): кнопки режимов на `DeckScreen`/`FolderScreen`/
     `HomeScreen`, кнопки финала «Знакомства», `onAnswer` в `StudyScreen`, «Продолжить» в итогах, свайп;
   - если iOS всё же отказал (холодный старт по ссылке) — `needsTap` и кнопка `TapToListen`.
7. **Запасной голос — Web Speech API** (`speakWithDevice`), только если облако не сработало. Если голоса для языка на устройстве нет (грузинский на iPhone), мы **молчим и объясняем** (`speech.noDeviceVoice`): чужой голос только исказит слово.

❌ **Не делать:**
- убирать «лишний» тихий `play()`;
- ставить `await` перед `unlockAudio()`;
- плодить аудиоэлементы;
- полагаться на `autoplay`;
- кэшировать `/api/tts` в service worker.

### 3.2 Цепочка получения аудио (`src/data/tts.js`)

```
память (Map, на сессию) → IndexedDB offlineAudio → Firestore audio_cache → POST /api/tts → Azure
```

- **Ключ** — общий для всех слоёв (`src/lib/tts.js`, `ttsCacheKey`):
  ```
  SHA-256( `${TTS_CACHE_VERSION}|${lang}|${normalizeTtsText(text)}` )   // hex
  TTS_CACHE_VERSION = "azure-v1"
  normalizeTtsText = NFC + схлопнутые пробелы + trim
  ```
  Ключ меняется только через bump `TTS_CACHE_VERSION` (при смене голосов или настроек). Формулу менять **синхронно** у клиента и функции: функция импортирует тот же модуль.
- **Голоса** — `VOICES` в `src/lib/tts.js`, один нейронный голос Azure на язык (`ka-GE-EkaNeural` и т. д.). Лимит — `MAX_TTS_CHARS = 200`.
- **`/api/tts`:**
  - принимает `Authorization: Bearer <Firebase ID token>`;
  - токен проверяется через `jose` по JWKS Google. `firebase-admin/auth` на Netlify падает с `ERR_REQUIRE_ESM` — не возвращать;
  - готовый звук функция пишет в `audio_cache` через Admin SDK. Клиенту правила разрешают только `get`, чтобы никто не мог подложить чужое аудио.

### 3.3 Offline Audio (IndexedDB, `src/data/offlineAudio.js`)

- **БД** `kartoteka-audio` (версия 1), хранилище **`offlineAudio`**.
- **Ключ** — тот же `ttsCacheKey`, **значение** — base64 MP3 (строка).
- **Ошибки не бросаются:** приватный режим, заблокированное хранилище или квота превращаются в «не сохранено».
- **Что попадает в кэш:**
  - всё, что устройство один раз скачало при озвучке (`putOfflineAudio` в `getSpeechAudio`);
  - озвучка всего набора по кнопке `AudioDownloadButton` → `downloadAudio(entries, { concurrency: 3, signal, onProgress })`:
    - уже сохранённые ключи пропускаются (`storedKeys`);
    - остальные качаются 3 параллельными воркерами;
    - загрузку можно прервать через `AbortController`, прогресс показывается в UI.
- Список того, что качать, строит `audioEntries(pairs)`: уникальные `{text, lang, key}` для языков, у которых есть облачный голос.
- Автоматической фоновой докачки без действия пользователя **нет** — только кнопка.

### 3.4 Прочие решения

| Решение | Почему |
|---|---|
| `data/store.js` — единственный импорт `firebase/firestore` | Тесты и подмены трогают один файл. |
| `firestore.rules` меняется в том же коммите, что и модель | Иначе у всех `permission-denied`. |
| Вход через Google/Apple только popup | Redirect ломался в iOS PWA (коммиты `9f05f63`, `61ae673`). |
| Миграция v2 → v3 (`migrate.js`) | Старые документы не удаляет, только помечает `migratedAt`. |
| Пароли наборов | Клиент шлёт хэш, сравнивают правила; plaintext не хранить. |
| Пуши — только data-сообщения | Уведомление собирает `src/sw.js`. |
| Поля ввода | `font-size ≥ 16px`, иначе iOS зумит страницу. |
| Safe area | Отступы через `env(safe-area-inset-*)`. |

---

## 4. Current State & Workflow

### 4.1 Команды

```bash
npm install
npm run dev            # vite → http://localhost:5173 (без Netlify Functions!)
npx netlify dev        # vite + функции → http://localhost:8888, работает /api/tts
                       # (netlify-cli не в devDependencies; вызывается через npx)
npm test               # node --test tests/*.test.js
npm run build          # прод-сборка + sw.js + manifest
npm run preview        # проверка PWA / service worker на сборке
```

При `npm run dev` запрос `/api/tts` недоступен. Облачная озвучка падает, срабатывает голос устройства — это ожидаемо. Чтобы проверить облачный голос, используй `npx netlify dev` и ключи Azure в окружении.

### 4.2 Firebase при локальной разработке

- **Мок-сервера и эмуляторов в репозитории сейчас нет.** Нет ни `firebase.json`, ни `connect*Emulator`, ни мок-модулей. Локально приложение работает с **реальным проектом Firebase** из `.env.local`.
- Без `.env.local` приложение не падает, а показывает экран «Подключите Firebase» (`missingConfig` в `src/firebase.js`).
- **Если нужен мок:** подменять только `src/data/store.js` (тот же набор экспортов), `src/data/useAuth.js` и `src/firebase.js` через плагин `resolveId` в отдельном vite-конфиге. Так раньше делался UI-стенд вне репозитория.
  - Мок живёт в памяти: перезагрузка страницы сбрасывает данные.
  - Если меняешь API `store.js`, обнови мок.
- **Не коммитить `.env.local`** (он в `.gitignore`).

### 4.3 Переменные окружения (`.env.example`)

| Переменная | Где |
|---|---|
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | клиент (Builds) |
| `VITE_FIREBASE_VAPID_KEY` | клиент, пуши |
| `VITE_GA_MEASUREMENT_ID` | клиент, GA4 (пусто = выкл.) |
| `VITE_APPLE_SIGN_IN=true` | показывает кнопку входа через Apple |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | только Functions (`send-reminders`, кэш в `tts`) |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (напр. `westeurope`) | только Functions (`tts`) |

Ключи функций никогда не делать `VITE_*`. На Netlify у функций лимит 4 КБ на все переменные окружения.

### 4.4 Последние внедрённые фичи (по коммитам)

**1. Режим «Знакомство»** — `mode=intro`, `src/components/study/IntroSession.jsx`:
- Без переворота и без оценок: слово, перевод и пример видны сразу.
- Управление: Next/Back, клавиши ←/→, свайп; пробел — повтор озвучки.
- Автоозвучка по общей настройке `settings.autoAudio` (см. п. 5). По умолчанию `{ term: true, definition: false, example: false }`; переключатели — за шестерёнкой.
- Карточки — непоказанные слова (`isUnseenCard`):
  - порция `MAX_NEW_PER_SESSION = 15`;
  - или все сразу с `?portion=all` — выбор в `introPortion` sheet на `DeckScreen`;
  - если всё уже показано — весь набор как обзор, без изменений прогресса.
- В конце: `lib.actions.markIntroduced(cards)` → `introducedAt`. Финальный экран предлагает Flashcards/Test/Write именно по этой порции: она стоит первой в следующей сессии.

**2. Умная блокировка новых слов по нагрузке** — «Intro gate», `src/lib/rounds.js` + `DeckScreen.jsx`:
```js
LEARNING_LIMIT = 15; LOAD_MAX_BOX = 2;
learningLoad(cards) = cards.filter(c => (c.lastReviewed != null || c.introducedAt) && c.box <= 2).length
introLocked = unseen > 0 && learningLoad(deck.cards) >= LEARNING_LIMIT
```
- В нагрузку идут только «свежие» слова (показанные или оценённые и всё ещё в коробке 1–2). Слова в коробке 3+ уже не считаются (коммит `6170a17`).
- UI объясняет блокировку тостом `introGate.locked` и подсказкой `introGate.lockedHint` с числом слов.
- Если непоказанных больше 15, сначала открывается выбор порции.

**3. Порции по 15 новых слов в обычной учёбе** — `buildPool(..., { newLimit })`. Экран «следующая порция»: `study.portionBody` / `study.nextPortion`.

**4. Офлайн-аудио и HTML5-плеер** — см. разделы 3.1 и 3.3.

**5. Единая авто-озвучка во всех режимах** — `settings.autoAudio` `{ term, definition, example }`:
- шестерёнка в шапке каждого режима (`AudioSettingsSheet`); старое поле `introAudio` читается как fallback (`autoAudioSettings`);
- защита от спойлеров (`autoSpeakParts`): при показе звучит только сторона-вопрос; сторона-ответ и пример — после переворота (Карточки) или после ответа (Тест, Письмо, Блиц при ошибке). В Письме при «почти» до показа разницы ответ не звучит;
- Тест/Письмо/Блиц ждут конца озвучки перед автопереходом (`afterSpeech`, максимум 8 с).

**6. Игровые режимы Match и Blitz** (`MatchMode.jsx`, `BlitzMode.jsx`, логика — `lib/games.js`):
- **Match** — раундовый режим (`ROUND_MODES` в `StudyScreen`): получает весь раунд, поля по `MATCH_BOARD_PAIRS = 6` пар, следующее поле — когда текущее очищено. Таймер, в итогах — время. Оценка через `useRounds.answer(grade, key)`: пара без ошибок → `know`, любая неверная пара с этим словом (оба слова пары) → `again`. Тап по слову сразу его озвучивает (по переключателю, без защиты от спойлеров);
- **Blitz** — слово + перевод (50% свой, 50% чужой из сессии, `blitzPrompt`), кнопки/← → ; верно → `know`, ошибка → `again` + правильный перевод;
- оба режима требуют ≥ 2 карточек (`minCards`), иначе StudyScreen показывает обычные карточки.

**7. Остальное:**
- пример предложения через ` // ` при импорте;
- полный i18n;
- редактирование профиля (`ProfileEditSheet.jsx`);
- вход через Email и Apple;
- SEO / GA4.

### 4.5 Перед завершением задачи

1. `npm test` — зелёный; новая логика из `src/lib/` покрыта тестом в `tests/logic.test.js`.
2. `npm run build` — без ошибок.
3. Проверить экран на ширине 390 px: нет горизонтального скролла, тап-зоны ≥ 44 px.
4. Ключи добавлены **в оба** файла: `ru.json` и `en.json`.
5. Если модель данных изменилась — обнови `firestore.rules`, нормализаторы `src/lib/model.js` и этот файл.

---

## 5. Formatting & Style Guidelines

### Код

- **Компоненты** — функциональные, на хуках. Классовый только `ErrorBoundary`.
- **Чистая логика** (расписание, раунды, гейт, цели, парсинг, выбор пушей, ключи TTS) живёт в `src/lib/` и не импортирует React, Firebase или i18n.
  - Её запускают Node-тесты и Netlify Functions (`tts.js` импортирует `src/lib/tts.js`, `send-reminders` — `src/lib/reminders.js`).
  - Переводимые формулировки для значений из `lib/` — в `src/i18n/format.js`; туда передаётся `t`.
- **Firestore** — только через `src/data/store.js`; в UI — через `useLibrary()`, `useDeckResource()`, `useFolderResource()`.
- **Экраны** — `src/screens/`, по одному на маршрут. Режимы учёбы — `src/components/study/`. Новый режим подключается в `StudyScreen.jsx` (`MODES`, `MODE_COMPONENTS`).
- **Комментарии** — шапка в начале файла: что это и почему так. Комментарии объясняют «почему», а не «что». Комментарии в коде — на английском.
- **Именование:**
  - `camelCase` — функции и переменные;
  - `PascalCase` — компоненты;
  - `UPPER_SNAKE` — константы-настройки (`MAX_NEW_PER_SESSION`, `LEARNING_LIMIT`, `TTS_CACHE_VERSION`).
- **Подтверждения и ввод** — через `useDialogs().confirm()` / `prompt()`; уведомления — через `useToast()`. Не использовать `window.confirm`/`prompt`.

### Стили (Tailwind v4 + Material 3)

- **Цвета** — только через роли M3 (`bg-surface-container-low`, `text-on-surface-variant`, `bg-primary`, `text-error`…) или `var(--md-*)`. Hex в компонентах не хардкодить — сломается тёмная тема.
- **Типографика** — шкала M3: `text-display-sm`, `text-headline-sm|md|lg`, `text-title-sm|md|lg`, `text-body-sm|md|lg`, `text-label-sm|md|lg`.
- **Готовые классы** (`@layer components` в `src/index.css`):
  - кнопки: `fc-btn` + `fc-btn-filled|tonal|outlined|text`, размер `fc-btn-lg`;
  - иконки и чипы: `fc-icon-btn`, `fc-chip`, `fc-seg`, `fc-badge`;
  - поля и контейнеры: `fc-input`, `fc-panel`, `fc-fab`, `fc-sheet`, `fc-menu`.
  Новые компоненты строить из них.
- **Mobile-first:**
  - отступы — `fc-gutter` (16 px + safe area);
  - нижняя навигация только на верхнеуровневых экранах (`/`, `/profile`);
  - учёба — полноэкранный маршрут `/deck/:id/study`, `/folder/:id/study`.
- **Анимации** учитывают `prefers-reduced-motion`.

### i18n (i18next, `src/i18n/`)

- **Инициализация** — `src/i18n/index.js`:
  - один namespace `translation`;
  - ресурсы — `locales/ru.json` и `locales/en.json`;
  - `fallbackLng: "en"`;
  - язык по умолчанию — `ru` для русскоязычного браузера, иначе `en`;
  - выбор хранится в `localStorage["kartoteka.lang"]`, смена — через `setLanguage(code)`.
- **В компонентах** — `const { t } = useTranslation()`. Вне React (например, `lib/speech.js`) — `import i18n from "../i18n/index.js"` и `i18n.t(...)`. Хардкода текста в JSX нет.
- **Ключи** — по экрану/фиче, верхний уровень = раздел: `deck.*`, `study.*`, `intro.*`, `introGate.*`, `introPortion.*`, `audioDownload.*`, `speech.*`, `summary.*`, `praise.*`…
- **Плюрализация** — через `count`:
  - русский: `_one` / `_few` / `_many` (`"rounds_one": "{{count}} раунд"`, `"rounds_few": "{{count}} раунда"`, `"rounds_many"`…);
  - английский: `_one` / `_other`.
  Руками склонения не собирать.
- **Интерполяция** — `{{name}}`, без конкатенации строк.
- **Новый ключ** добавлять сразу **в оба** файла.
- **Фразы похвалы и мотивации** лежат в локалях (`praise.<level>`, `motivationalPhrases`); `lib/rounds.js` возвращает только уровень (`praiseLevel`).
- **Тексты пушей** (`PUSH_MESSAGES` в `src/lib/reminders.js`) выбирает серверная функция, поэтому они не зависят от react-i18next.

### Git

- Маленькие атомарные коммиты на английском в стиле истории: «Intro: portion choice, …», «Fix …».
- Не коммитить `.env.local`, `dist/`, ключи сервисного аккаунта и Azure.
