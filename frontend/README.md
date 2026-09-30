# BIS SAHAYAK — Frontend

Source-backed compliance assistant for Indian MSMEs. Describe a business in plain language (English, हिन्दी, मराठी), confirm the extracted profile, and get a dependency-aware roadmap where **every claim has a source, and unsupported claims are flagged instead of invented.**

Companion to the Backend PRD v2.0 · Problem Statement 26107.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` typecheck + production bundle |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build |

### Backend configuration

The API base URL is read from `VITE_API_URL` and defaults to `http://localhost:8000/api/v1`:

```bash
echo "VITE_API_URL=https://your-backend.example.com/api/v1" > .env.local
```

The backend must serve the envelope `{ success, data, message | error }` described in the Backend PRD §8 (API integration map), including the SSE contract from Frontend PRD §8.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | React + Vite + TypeScript |
| Routing | React Router (lazy, route-split) |
| Server state | TanStack Query |
| UI state | Zustand (`stores/index.ts`, persisted where allowed) |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS + shadcn-style components on Radix primitives |
| Icons | lucide-react |
| Streaming | `@microsoft/fetch-event-source` (SSE over POST with auth headers) |
| Markdown / text | Sanitized rendering, no `dangerouslySetInnerHTML` |
| i18n | i18next + react-i18next (`src/locales/{en,hi,mr}`) |
| Maps (labs) | Leaflet + OSM tiles (lazy-loaded, no API key) |
| Voice input | Web Speech API, feature-detected (`en-IN` / `hi-IN` / `mr-IN`) |
| Fonts | Inter + Noto Sans Devanagari |

---

## Routes

| Route | Screen | Auth |
|---|---|---|
| `/` | Landing with example prompts | Public |
| `/login`, `/register` | Auth | Public |
| `/chat`, `/chat/:conversationId` | Chat workspace (SSE streaming) | User (anonymous chat allowed) |
| `/business/:id` | Profile view + edit | User |
| `/business/:id/roadmap` | Roadmap tracker | User |
| `/applications` | Application tracker | User |
| `/standards`, `/standards/:id` | Standards search, recommend, detail | Public |
| `/labs` | Labs finder (list + map) | Public |
| `/consumer` | Consumer & hallmarking help | Public |
| `/admin/metrics`, `/admin/sources` | Benchmark metrics, ingestion status | Admin |

Public routes work without login so judges can try them immediately.

---

## Architecture

```
src/
├── components/
│   ├── ui/            Button, Input, Card, toast (base layer)
│   ├── chat/          ChatMessage, ProfileCard, CitationChip, SourcePanel
│   ├── roadmap/       StepCard, StepDrawer, dependency lock logic
│   ├── shared/        badges, states, verified, LanguageSwitcher, VoiceInput, AppLayout
├── hooks/
│   └── useChatStream.ts   SSE reducer (meta / profile / token / citations / roadmap / replace / done / error)
├── locales/{en,hi,mr}/common.json
├── pages/             landing, chat, profile, roadmap, applications, standards, labs, consumer, admin, auth
├── services/api.ts    Fetch wrapper: in-memory access token, httpOnly refresh, one retry on INVALID_TOKEN
├── stores/            chat, ui (language, citation, panels), profile, roadmap, auth
├── types/             Shared API types
└── lib/               i18n init, cn/date/currency helpers
```

### Design principles encoded in code

1. **Evidence is first-class** — citations sit beside the answer; tapping one opens `SourcePanel` (document, clause, page, highlighted excerpt, `Verified on`, official link in a new tab).
2. **Honesty over polish** — `INSUFFICIENT_EVIDENCE` renders as a neutral card with an official-source pointer, not an error; `NEEDS_VERIFICATION` gets an amber banner.
3. **Never auto-complete** — only the user marks a step done; status updates are optimistic `PATCH`es with rollback on failure.
4. **Confirm before generating** — the profile card is editable chips + quick replies; the roadmap only builds after **Confirm profile**.
5. **Guide, don't automate** — Apply / Check status / Open status page always hand off to official portals via `rel="noopener noreferrer"`.
6. **Mobile first** — single-column chat, sources as a bottom sheet, ≥44 px touch targets, route-based code splitting (Leaflet / admin pages lazy).

### Status & confidence

Both render as **icon + text**, never color alone:

| Status | | Confidence | |
|---|---|---|---|
| `NOT_STARTED` | gray circle | `HIGH` | green |
| `IN_PROGRESS` | blue clock | `MEDIUM` | blue |
| `COMPLETED` | green check | `LOW` | amber |
| `NOT_APPLICABLE` | slate slash | `INSUFFICIENT_EVIDENCE` | gray + info |
| `NEEDS_VERIFICATION` | amber alert | | |

`Verified on` older than 90 days switches to an amber "recheck with the official authority" style.

---

## Chat streaming contract

`POST /chat/message` (SSE). Implemented in `src/hooks/useChatStream.ts`:

| Event | UI effect |
|---|---|
| `meta` | store conversation id, route to `/chat/:id`, mark intent |
| `profile` | render `ProfileCard` with editable chips + `questions` |
| `token` | append to streaming answer, auto-scroll |
| `citations` | render citation chips, feed Source panel |
| `roadmap` | render roadmap summary card with **Open roadmap** |
| `replace` | swap text, show downgraded / insufficient-evidence state |
| `done` | confidence badge, verified-on, suggested actions, feedback |
| `error` | error card with retry (`RATE_LIMIT_EXCEEDED`, `AI_SERVICE_ERROR`, …) |

On disconnect the partial text is kept and **Connection lost · Retry** is offered. If the backend sends nothing, the stream is converted to an error state — unvalidated claims are never left presented as confirmed.

---

## i18n

- UI strings live in `src/locales/{en,hi,mr}/common.json` — no hardcoded text.
- The language switcher updates i18next **and** the `language` field sent with chat requests (`auto` detection is the backend default when untranslated).
- Enum values (`COMPLETED`, `NEEDS_VERIFICATION`, …) are translated for display only.
- Source excerpts stay in the original English in the Source panel.
- Voice input picks `en-IN` / `hi-IN` / `mr-IN`; the mic hides when the browser lacks Web Speech.

---

## State & data

- **Server state:** TanStack Query for businesses, roadmap, standards, labs, applications; step updates are optimistic with rollback.
- **Zustand:** language, chat draft, selected citation, panel state, streaming buffer. Persisted: language, draft, mode only.
- **Security:** access token in memory only, refresh via httpOnly cookie, no secrets in the bundle, no personal data in `localStorage` (roadmap/application data is never persisted client-side). Document checklists are per-device `localStorage`.
- **Disclaimer:** "Verify with the official authority. Not legal advice." is shown on every screen that makes compliance claims, including above the chat input and in the footer.

---

## Testing & checks

```bash
npm run lint      # oxlint — warnings only (fast-refresh exports, data-fetch effects)
npm run build     # tsc -b + vite build — must be clean
```

Recommended before a demo (PRD §14):

- E2E the bottle-in-Mumbai flow: send message → fix chips → confirm profile → open roadmap → Why on the BIS step → citation opens the exact excerpt → mark a step completed → progress bar updates → ask an unanswerable question → insufficient-evidence card.
- Hindi and Marathi queries on a real phone; Devanagari layout overflow check.
- Throttled 4G: first streamed token should render immediately.

---

## Demo path (must work flawlessly)

1. Landing → click the Marathi example → UI answers in Marathi.
2. Profile card → fix chips → **Confirm profile**.
3. Roadmap opens: phases, locked step, progress bar.
4. BIS standard step → **Why do I need this?** → Source panel with clause and page.
5. Labs → filter Maharashtra → verified dates visible.
6. Mark a step completed → progress bar updates.
7. Ask a question the data can't support → insufficient-evidence card with official link.
8. `/admin/metrics` → benchmark numbers.

**Never cut:** Source panel, confirm-profile step, insufficient-evidence state.
