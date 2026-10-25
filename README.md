# Kartoteka 3.0 — карточки по Лейтнеру (PWA)

React + Vite + Tailwind v4 (Material Design 3) + Firebase (Auth, Firestore, Cloud Messaging) + Netlify.

## Что нового в 3.0

| # | Функция | Где в коде |
|---|---|---|
| 1 | Режимы учёбы на весь экран (без дашборда, только урок и «Выйти») | `src/screens/StudyScreen.jsx` |
| 2 | Раунды по 10/20/30 карточек, экран «Итоги раунда», «Продолжить» = раунд только из ошибок | `src/lib/rounds.js`, `src/hooks/useRounds.js`, `src/components/study/RoundSummary.jsx` |
| 3 | Типографика Material 3: Roboto Flex + шкала M3 в Tailwind `@theme` | `src/index.css`, `src/main.jsx` |
| 4 | Папки как метки: колода в нескольких папках, «Study All» по всем колодам папки | `src/screens/FolderScreen.jsx`, `src/data/LibraryProvider.jsx` |
| 5 | Ударный режим 🔥 и цель дня (минуты или раунды) | `src/lib/goals.js`, `src/components/StreakWidget.jsx` |
| 6 | Пуш-напоминания в 20:00, если цель не выполнена | `src/lib/reminders.js`, `src/lib/push.js`, `src/sw.js`, `netlify/functions/send-reminders.mjs` |
| 7 | React Router + ссылки «Поделиться» | `src/App.jsx`, `src/lib/share.js` |
| 8 | Нижняя навигация, «Вернуться к изучению», свайп папок | `src/components/BottomNav.jsx`, `src/screens/HomeScreen.jsx` |
| 9 | Экран папки: поиск, теги («Экзамен 1»), сортировка, FAB «+», меню ⋮ | `src/screens/FolderScreen.jsx` |
| 10 | Редактор набора: языки, «Кто видит», «Кто редактирует», пароль | `src/screens/EditorScreen.jsx`, `firestore.rules` |
| 11 | Страница набора в стиле Quizlet: карусель, режимы, прогресс, ⭐, озвучка | `src/screens/DeckScreen.jsx`, `src/components/CardCarousel.jsx` |
| 12 | Умная кнопка «Study this set» (IntersectionObserver) | `DeckScreen.jsx` |
| 13 | 🔖 «Добавить в папку» и меню ⋮ (скачать, копия, сброс, инфо, удалить…) | `DeckScreen.jsx`, `src/components/sheets.jsx` |
| 14 | «Choose a goal»: Cram for a test / Memorize it all → Start learn | `sheets.jsx` (`GoalSheet`), `src/lib/leitner.js` (`nextProgress`) |

### Маршруты

```
/                       Главная (цель дня, «Вернуться к изучению», папки, наборы)    + нижняя навигация
/profile                Профиль (цель, размер раунда, уведомления, тема, экспорт)     + нижняя навигация
/create                 Новый набор (полноэкранный редактор)
/deck/:id               Набор (ссылкой можно делиться)
/deck/:id/edit          Редактирование
/deck/:id/study         Учёба: ?mode=flashcards|learn|quiz|write &goal=memorize|cram &starred=1
/folder/:id             Папка (ссылкой можно делиться)
/folder/:id/study       «Study All» по всем наборам папки: ?tag=<id тега>
```

Пункт 1 просил обойтись без React Router, а пункт 7 — добавить его. Сделано так: учёба — это отдельный маршрут, который рисуется вне оболочки с навигацией. Получается тот же полноэкранный урок, но у него есть свой адрес и работает кнопка «Назад».

---

## Модель данных (schema v3) и обратная совместимость

```
decks/{deckId}                 содержимое набора: title, description, termLang, defLang,
                               visibility (public|password|private), editPolicy (owner|password),
                               cards[{id, term, definition, exampleSentence}], ownerId, ownerName
deckStubs/{deckId}             публичная «обложка»: название, автор, тип доступа (для экрана пароля)
deckSecrets/{deckId}           SHA-256 пароля (читает только автор)
decks/{deckId}/grants/{uid}    «пользователь ввёл верный пароль» (проверяется правилами)
folders/{folderId}             name, color, deckIds[] (метка на колодах), tags[{id,name,deckIds}], visibility
users/{uid}                    settings, currentStreak, longestStreak, lastStudyDate, dailyProgress, fcmTokens
users/{uid}/library/{deckId}   ЛИЧНЫЙ прогресс Лейтнера: progress{cardId:{box,lastReviewed,…}}, starred[]
```

**Почему прогресс хранится отдельно от набора.** Общий набор учат разные люди, и у каждого свои коробки Лейтнера. Оценка карточки обновляет одно поле `progress.<cardId>`, поэтому два устройства больше не перезаписывают изменения друг друга.

**Почему папка хранит список наборов, а не набор — поле `tags`.** Папкой можно поделиться, и в ней бывают чужие наборы, которые вы не можете редактировать. С точки зрения пользователя это те же метки: один набор может лежать в нескольких папках.

**Старые наборы (v2, `users/{uid}/decks`).** При первом входе они автоматически переносятся (`src/data/migrate.js`):

- id сохраняются;
- прогресс из карточек переходит в `library`;
- перенесённые наборы получают доступ «Только я»;
- оригиналы не удаляются, им ставится отметка `migratedAt`;
- текущий стрик восстанавливается по старому журналу повторений.

Поле тегов старым наборам не нужно: они просто ещё не лежат ни в одной папке. В новых документах все отсутствующие поля получают значения по умолчанию (`normalizeDeck`, `normalizeFolder`). Резервные копии v1/v2 тоже импортируются.

---

## Какие файлы заменить (если обновляете проект вручную)

Проще всего взять весь архив. Если переносите по файлам:

**Удалить:**
- `src/components/BoxProgress.jsx`
- `src/components/CardsManager.jsx`
- `src/components/DeckRail.jsx`
- `src/components/Header.jsx`
- `src/components/ImportDialog.jsx`
- `src/components/study/StudyShell.jsx`
- `src/hooks/useStudySession.js`
- `src/data/useLibrary.js`

**Заменить:**
- корень проекта: `package.json`, `index.html`, `vite.config.js`, `netlify.toml`, `firestore.rules`, `.env.example`
- `src/`: `App.jsx`, `main.jsx`, `index.css`
- `src/components/`: `ui.jsx`, `screens.jsx`, `PwaPrompts.jsx`, `ErrorBoundary.jsx`
- `src/components/study/`: `FlashcardMode.jsx`, `QuizMode.jsx`, `WriteMode.jsx`, `DiffView.jsx`, `RatingHint.jsx`
- `src/data/`: `store.js`, `useAuth.js`
- `src/lib/`: `model.js`, `leitner.js`, `backup.js`, `speech.js`
- `tests/logic.test.js`

**Добавить:**
- `src/sw.js`
- `src/screens/`: все 6 файлов
- `src/components/`:
  - `BottomNav.jsx`, `CardCarousel.jsx`, `DeckListItem.jsx`, `PasswordGate.jsx`
  - `StreakWidget.jsx`, `providers.jsx`, `sheets.jsx`
  - `study/LearnMode.jsx`, `study/RoundSummary.jsx`
- `src/data/`: `LibraryProvider.jsx`, `useRemote.js`, `migrate.js`, `merge.js`
- `src/hooks/`: `useRounds.js`, `useStudyTimer.js`, `useNow.js`
- `src/lib/`:
  - `rounds.js`, `goals.js`, `reminders.js`, `push.js`
  - `share.js`, `languages.js`, `profileBackfill.js`
- `netlify/functions/send-reminders.mjs`
- `public/badge-96.png`

**Без изменений:**
- `src/firebase.js`, `src/hooks/useInstallPrompt.js`
- `src/lib/`: `levenshtein.js`, `parser.js`, `celebrate.js`, `utils.js`

**Новые зависимости:**
- `react-router-dom`
- `firebase-admin` (только для функции на Netlify)
- `@fontsource-variable/roboto-flex`, `@fontsource-variable/roboto-mono`
- `workbox-precaching`, `workbox-routing`, `workbox-core`

**Удалены:** шрифты Bricolage, Atkinson и JetBrains Mono.

---

## Настройка

### 1. Firebase (если проект уже есть — пункты 1.3–1.5)

1. Firebase Console → проект → веб-приложение. Скопируйте `firebaseConfig` в `.env.local` (шаблон в `.env.example`).
2. Authentication → Sign-in method → включите **Google** и **Anonymous**.
3. **Firestore → Rules:** вставьте `firestore.rules` → **Publish**. Это обязательно, старые правила не подходят к новой схеме.
4. **Cloud Messaging** (для пушей):
   - Project settings → Cloud Messaging → Web Push certificates → **Generate key pair**;
   - публичный ключ → `VITE_FIREBASE_VAPID_KEY`.
5. **Service account** (для функции напоминаний):
   - Project settings → Service accounts → **Generate new private key**;
   - из JSON понадобятся `client_email` и `private_key`.

### 2. Локальный запуск

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # юнит-тесты: Лейтнер, Левенштейн, раунды, стрик, напоминания, миграция
npm run build && npm run preview   # проверка PWA / service worker
```

### 3. Netlify

Site configuration → Environment variables:

| Переменная | Scope | Откуда |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID` | Builds | firebaseConfig |
| `VITE_FIREBASE_VAPID_KEY` | Builds | шаг 1.4 |
| `FIREBASE_PROJECT_ID` | Functions | id проекта |
| `FIREBASE_CLIENT_EMAIL` | Functions | шаг 1.5 |
| `FIREBASE_PRIVATE_KEY` | Functions | шаг 1.5, вставить целиком вместе с `-----BEGIN…` |

Ставьте scope правильно: у функций AWS общий лимит на переменные окружения — 4 КБ.

Дальше:

1. `git push` → Netlify соберёт сайт сам.
2. Функция `send-reminders` запускается каждый час: в `netlify.toml` задан каталог, в самой функции — `export const config = { schedule: … }`.
3. Проверить вручную: Netlify → Logs → Functions → send-reminders → **Run now**.
4. Firebase → Authentication → Settings → **Authorized domains** → добавьте домен Netlify.

### 4. Пуш-уведомления: как это работает

1. Профиль → «Напоминания» → включить. Приложение вызывает `Notification.requestPermission()`, получает FCM-токен для нашего service worker и сохраняет его в `users/{uid}.fcmTokens`.
2. Приложение сохраняет часовой пояс и часы напоминаний: 20:00, или 9:00 и 20:00. Они пересчитываются в UTC (`settings.notify.utcHours`).
3. Раз в час функция выбирает пользователей с текущим UTC-часом. Пуш уходит только тем, у кого **не выполнена цель дня**, и не чаще одного раза за слот. Текст выбирается по ситуации, из списка `PUSH_MESSAGES`:

| Ситуация | Сообщение |
|---|---|
| Серия под угрозой | «…спасать огонёк 🔥» |
| Уже начали сегодня | «…добей сегодняшний раунд 🎯» |
| Не заходили 2+ дня | «Эй, мы скучаем!» |
| Вечер | «До конца дня еще 4 часа…» |

На iPhone пуши работают только в установленном приложении («На экран Домой»), начиная с iOS 16.4.

---

## Настройка под себя

| Что | Где |
|---|---|
| Интервалы коробок, что значит «почти» | `src/lib/leitner.js` |
| Сколько опечаток считается «почти» | `src/lib/levenshtein.js` → `typoTolerance` |
| Размеры раунда, фразы похвалы | `src/lib/rounds.js` |
| Варианты цели, фразы виджета | `src/lib/goals.js` |
| Тексты пушей, часы напоминаний | `src/lib/reminders.js` |
| Цвета, шрифты, шкала M3 | `src/index.css` (`@theme`) |
| Список языков озвучки | `src/lib/languages.js` |

## Ограничения, о которых стоит знать

- **Пароль набора проверяется правилами Firestore без сервера.** Клиент присылает SHA-256 от `deckId:пароль`, правило сравнивает его с хэшем в `deckSecrets`. Это надёжно против случайного доступа, но не защищает от перебора простых паролей. Смена пароля сразу отзывает все выданные доступы.
- **Конфликты при одновременной правке.** Если два человека одновременно редактируют один набор, сохранится последняя запись. На прогресс это не влияет: он у каждого свой.
- **«Добавить в класс»** пока заглушка.
