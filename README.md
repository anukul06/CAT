# Desktop PA

**A little companion that sees what you see.**

An Electron desktop companion with an expressive green sprout, a compact dark assistant panel, approved screenshot analysis, local tasks and reminders, approved memory, and visible agent activity. No backend server or account system.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended), npm, and macOS or Windows.

```sh
npm install
npm run sign:dev  # macOS: local signature for development notifications
cp .env.example .env
# Edit .env and add your own GEMINI_API_KEY
npm run dev
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). Never add a `VITE_` prefix to the key. Restart after editing `.env`. The renderer never receives the key.

```dotenv
GEMINI_API_KEY=your_key_here
GEMMA_MODEL=gemma-4-26b-a4b-it
```

The default is the requested Gemma 4 26B model. Google's [Gemma API documentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api) lists `gemma-4-26b-a4b-it` and `gemma-4-31b-it` with image support. Availability still depends on your account. On the first send, Desktop PA checks model access and sends a tiny, non-private test image to verify that the configured Gemma model accepts images. This uses API quota. It never silently switches to Gemini. An unavailable or text-only model produces a configuration error; select an image-capable Gemma model available to your AI Studio account in `GEMMA_MODEL`.

## Demo

1. Launch the app. A floating, blinking sprout appears near the lower right of your desktop.
2. Drag the pet to reposition it. Click it to expand the panel.
3. Open an article, diagram, or coding error in another app.
4. Choose a display, then **Analyze screen**. Desktop PA hides its window briefly while capturing.
5. Inspect the preview. Enter a question, then **Approve & send**. Use × on the preview to discard it.
6. Read the real model response. Ask follow-up questions using the same approved snapshot. Nothing is captured continuously.
7. Minimize with the header button. Use the footer power icon or the application menu to quit.

Enter sends; Shift+Enter adds a newline. Suggestion buttons fill the question without sending. Analyze Screen takes a local screenshot only; approval is required before that screenshot is transmitted. Text-only questions are also supported. The pet supports idle, blink, breathe, bounce, wave, thinking, listening, happy, confused, sleepy and celebrating poses, with short status bubbles and reduced-motion support. Local task and memory operations also drive pet reactions.

## macOS screen permission

The first capture requests Screen Recording access through Electron/macOS. If blocked, use the in-app settings link or open **System Settings → Privacy & Security → Screen Recording** (called **Screen & System Audio Recording** on some versions). Enable **Electron** for development or **Desktop PA** for a packaged build, then fully quit and restart the app. Screen capture and the permission prompt need to be tested on the target macOS version. Microphone access is requested only when you press Record a note in Memory. Camera access remains blocked.

On Windows, Electron uses the native screen capture backend. Windows support is implemented but has not been verified on Windows hardware. Some protected windows, DRM content, and OS security screens cannot be captured. Full-screen spaces and OS window transitions can affect whether the pet is excluded; always inspect the preview. Capture resolution is capped around 2560 pixels wide for latency and legibility.

## Build and verify

```sh
npm run typecheck
npm test
npm run build
npm start
npm run test:desktop
npm run dist
```

`npm run build` produces the renderer in `dist/` and Electron code in `dist-electron/`. `npm run dist` creates an installer in `release/`; release signing/notarization requires your Apple/Windows developer credentials. The project does not include distribution signing identities. For local macOS development, run `npm run sign:dev` after installing/replacing Electron: it ad-hoc signs only the generated Electron bundle in node_modules. This seals its Info.plist/resources so Electron 45 can use the native notification API. This is not a distribution signature or notarization.

`test:desktop` launches real Electron with temporary history storage, checks renderer isolation, pet rendering, panel expansion, IPC input validation, and missing-key handling. It saves a UI-only screenshot to `artifacts/app.png`. To additionally exercise real screen capture (which may prompt for macOS permission):

```sh
SCREENSENSE_TEST_CAPTURE=1 npm run test:desktop
```

This optional test discards the captured display in memory without writing it or sending it to Google. The normal desktop test does not capture the display. Unit tests cover configuration validation, sanitized API errors, missing credentials, persistent history, agent routing, task CRUD, concurrent persistence, approved memory edits/deletion, timezone parsing, reminder deduplication across restarts, notification failure handling, and small/multiple-display geometry. Desktop integration also submits the real Tasks and Memory forms, edits a memory, verifies agent activity, tests a due native notification and pet drag/click. It uses temporary local data; notification delivery may be reported as failed when OS permission/signing is unavailable. A successful live AI analysis requires your API key and model quota; automated checks do not fabricate a response. `npm run test:vision` sends only the saved UI-only app screenshot in `artifacts/app.png` to your configured Gemma model and prints its real answer. It never captures the desktop.

## Architecture and privacy

- `electron/main.ts`: window geometry, trusted-sender IPC, screenshot approval lifecycle, chat orchestration.
- `electron/preload.cjs`: minimal sandbox-compatible context bridge. No generic IPC, filesystem, or shell access.
- `electron/screenshot.ts`: display selection, macOS permission status, on-demand `desktopCapturer` capture with the companion hidden.
- `electron/gemma.ts`: `@google/genai` in the main process only; model access and image checks; bounded conversation context, timeouts, actionable errors.
- `electron/store.ts`: atomic, bounded JSON chat storage (100 messages), user-only file mode where supported.
- `src/`: React/TypeScript UI, Tailwind + CSS animations, SVG sprout, screenshot preview and explicit approval.

The window uses `contextIsolation`, disabled `nodeIntegration`, sandboxed preload, a Content Security Policy, and denied navigation/popups. Media permission is limited to audio from the app’s main frame after an explicit recording request; camera and unrelated permissions remain blocked. Only the main frame of the app window can invoke IPC. Text is rendered as plain text, never model-provided HTML. The main process owns screenshot IDs, so the renderer cannot submit arbitrary images or forge stale approval.

Chat text is stored unencrypted locally in Electron's user-data folder (`~/Library/Application Support/ScreenSense AI/` in a packaged macOS app; development may use `screensense-ai/`). The latest 20 messages are sent as context; up to 100 are retained locally. Screenshot bytes stay in memory only and are never saved to history. The latest approved image is resent to Google for follow-ups until a new screenshot replaces it, the conversation is cleared, or the app quits. After restarting, text history remains but screenshot context is gone. Use the trash icon to clear text history and all image context. Google processes approved content under your API account's applicable terms.

For a packaged app, place `.env` in its user-data folder instead of inside the application bundle. Secrets are excluded from the build and Git. There is no fake-response mode, continuous screen monitoring, arbitrary command execution, voice feature, or cloud database. Local task/reminder tools run only from explicit user commands or controls.


## Local assistant capabilities

The existing Chat panel now has **Tasks**, **Memory**, and **Agent Watch** tabs. A deterministic `Coordinator` routes explicit user intents; there are no autonomous agent loops or separate model instances.

- **VisionAgent** uses the one shared Gemma client for an approved screenshot and its follow-ups. Pending screenshot approval always takes precedence over local command routing.
- **TaskAgent** runs `create_task`, `list_tasks`, `complete_task`, `delete_task`, and `create_reminder` locally. Tool results are reported only after storage succeeds.
- **ResearchAgent** answers general questions through Gemma. There is no live search provider, and it must not claim live web research.
- **MemoryAgent** stores explicitly requested or form-approved preferences/summaries. Saved memories are included with future AI requests. It does not automatically infer personal memories or save screenshots.

Try these in Chat, with no pending screenshot:

```text
Add task prepare my demo
Show my tasks
Complete task prepare my demo
Delete task prepare my demo
Remind me to push my code in 15 minutes
Remind me to call tomorrow at 9:30 am
Remember that I prefer concise answers with examples
What do you remember about me?
```

For task names, completion and deletion require an exact title, ID, or task number from Chat's list; ambiguous matches ask for clarification. Unsupported reminder phrases ask for an explicit time. Use Tasks' local date/time picker for other dates. Local task and memory commands work without an API key. The coordinator emits internal running/success/error events to drive the pet; the separate Agents activity tab has been removed.

### Reminder timing and delivery

Reminder dates are persisted as UTC ISO instants, with the originating IANA system timezone. Relative delays and local “today/tomorrow at” commands are interpreted on this machine; UI dates use the current system timezone. The scheduler checks due tasks at launch, after wake, and at the next due time. It uses one small timer, with a maximum 60-second clock recheck. Completed and deleted tasks never produce a new reminder.

**Keep Desktop PA running for on-time delivery.** When the app was quit or the computer was asleep, missed reminders are checked on the next launch/wake. No background daemon is installed. Each notification is claimed durably before delivery, so it is attempted at most once across restarts. A crash between claim and delivery can miss an OS notification; the task remains visibly due. Delivery failures are shown on the task, and are not automatically retried into duplicates. The pet also shows an in-app due bubble. Enable Electron/Desktop PA in macOS Notification settings; Focus modes can suppress banners even when the OS accepts delivery.

### Memory and deletion

`assistant.json` in the same user-data folder contains up to 500 tasks and 100 explicitly approved memories. `history.json` still contains up to 100 conversation messages, with agent labels. Writes are serialized and atomic. No image bytes are written by either store.

Inspect/edit/delete memories in **Memory**; **Draft from chat** prepares editable text from the latest six messages and requires approval before saving. “Remember that …” is itself an explicit save instruction and is acknowledged in Chat. Delete tasks with their trash buttons; complete them with the checkbox. The header trash button clears conversation text and the approved screenshot context, while Tasks and Memory have separate deletion controls. The full data folder is visible in Memory. Data is local plaintext, not encrypted. Session activity is held in memory only.

### Upgrade verification (25 October 2026)

Verified on this Mac: production build/typecheck, all unit tests, real Electron launch, native display capture, preview/discard and approval control, local Tasks/Memory forms, memory editing, task completion/deletion, agent activity, click versus drag, and a scheduled native notification after local development signing. Live Gemma model metadata, image acceptance and a genuine description of the app's UI-only screenshot were verified using PNG and JPEG requests.

The historical screenshot error cannot be attributed to a particular HTTP status: the previous handler discarded provider details. Current requests succeed. Errors now preserve the HTTP status when present, distinguish service failures, rate limits, authentication, bad requests, timeouts and empty/token-limited responses, retain the screenshot for retry, and log only sanitized diagnostics. Gemma 4 response requests use Google's documented minimal thinking level for lower latency; the model ID never changes automatically.

Still requiring target-device/manual checks: notification interaction/Focus settings, signed distribution installers, Windows behavior, physical multi-monitor rearrangement, and the complete flow with your own private desktop screenshot approved in the app.


## Desktop PA task sheet and voice notes

The product is now named **Desktop PA**. The internal package name, IPC channels, application ID, and existing user-data locations remain stable so your API key, conversation, tasks, and memories survive the rename.

The Tasks tab uses a compact native-dialog layout with **What do you need to do?**, **Due by**, and quick **1 hour**, **3 hours**, **Tomorrow** (9 am), and **Tonight** (9 pm) buttons. After 9 pm, Tonight selects the next evening; the exact local date is always shown beneath the form. Due time is optional for a plain task. Past/invalid dates are caught before submission with a readable inline message. The main process still validates every date independently. Cancel resets the draft.

Memory now includes **Voice notes**. Press **Record a note**, grant microphone permission if macOS asks, then **Stop recording**. Listen to the draft, give it a name, and explicitly **Save voice note**, or discard it. Notes stop at three minutes. Leaving Memory or closing the panel stops recording and discards unsaved audio. Saved notes have playback and delete controls. There is no transcription or AI upload.

Voice files and their index live in `voice-notes/` under the existing app data folder, shown in Memory. The main process owns all file paths and validates note IDs, size (8 MB), WebM format, duration and title. The renderer gets only note metadata and requested audio playback data. Deleting a note removes its audio file and index record. Text-memory deletion is separate from voice-note deletion.

For microphone access on macOS, enable Electron (development) or Desktop PA (packaged) in **System Settings → Privacy & Security → Microphone**. The packaged build includes the microphone usage description and audio-input entitlement. Build a local app bundle with `npm run package:mac`; installers are still available through `npm run dist` and distribution signing needs your own identity.

Verified for this update: 16 unit tests, typecheck/build, the real Electron task form and quick-date/past-date behavior, voice recording of a generated test tone through MediaRecorder (without accessing the microphone), local save/playback/delete, memory controls, notification delivery, and pet dragging. Actual microphone permission and recording from your physical device require an interactive check on your Mac.


## Agent Watch — approved Terminal snapshots

**Agent Watch** is a new assistant tab. It observes only a display screenshot you capture and explicitly approve. It does not connect to Hermes, inspect hidden terminal output, execute commands, or monitor continuously. The existing Chat screenshot/approval context remains separate.

For the demo:

1. Put the running agent's Terminal on a visible display, with readable output.
2. Open **Agent Watch**, select the display, and press **Capture Terminal screen**. The pet window briefly hides for capture. Nothing is sent yet.
3. Inspect the preview for private content. Discard/retake as needed, then press **Approve & analyze**.
4. Gemma returns structured observations: apparent activity; `working`, `waiting`, `error`, `completed` or `unknown`; visible warnings/errors; recommended human next action; estimated confidence, evidence and limitations.
5. After the Terminal visibly changes, capture a new screenshot. Leave **Compare with last approved summary** enabled and press **Approve & compare**.
6. Read the comparison and select older timeline entries to review their observations. A status indicator always refers to the last approved snapshot, not a live process. Waiting, working/progress, completion and error observations trigger distinct green-pet reactions.

Comparison sends the newly approved screenshot plus the **previous approved AI summary** to Google. Previous screenshots are not retained, so it is not a pixel/image-to-image diff. The previous summary may be mistaken; unreadable output or unrelated terminal contexts limit conclusions. No hidden/intermediate work can be inferred. There is no direct Hermes control.

Up to 50 approved structured summaries, their model ID, capture/analysis timestamps, display label, and comparison links are stored as local plaintext in `agent-watch.json` in the existing user-data folder. Screenshot bytes stay in memory only, are released after successful analysis, and are never included in the persisted watch record. Failed requests preserve the pending preview for an explicit retry. The **Clear Agent Watch history** button deletes only watch summaries and the pending watch image. Chat, tasks, voice notes and memories are unaffected.

The main process owns pending watch captures and validates their IDs before any model call. Stale approvals and stale comparison baselines fail without sending an image. Model responses must parse and pass the structured-result contract; malformed/empty replies never become fallback success statuses. Unknown is an actual model-returned result, not a fabricated status. API failures include safe HTTP/provider codes where available and setup/quota/network guidance. Keys and raw provider responses are never logged; exact API keys and recognizable key strings are redacted from watch summaries.

### Watch verification

```sh
npm test                 # 25 focused tests, including watch approval and comparison boundaries
npm run test:desktop     # real Electron UI and local integrations; no live model needed
SCREENSENSE_TEST_CAPTURE=1 npm run test:desktop
npm run test:watch:live  # opt-in real Gemma calls using controlled Terminal screenshots
```

The native-capture option verifies the Watch preview/approval/discard UI without transmitting the desktop. The live test renders two clearly identified, controlled Terminal fixtures in its own window and sends those screenshots through the same watch service and configured Gemma client. It verifies real structured analysis, follow-up comparison, and image-free persistence; it does **not** claim to be observing a running Hermes process. Fixture screenshots are not written to disk. Actual model summaries are written only as ignored test artifacts to `artifacts/watch-live-results.json` for UI inspection. To render those real fixture results in an isolated test app:

```sh
SCREENSENSE_WATCH_RESULTS=artifacts/watch-live-results.json npm run test:desktop
```

Unit tests use contract fixtures only for validation/storage boundaries and never populate the real app's observation timeline. Your live agent and private screenshot flow require your own approval in the app.


## Direct log access in Agent Watch

The separate **Agents** activity tab is removed. Agent Watch now defaults to **Direct log**, with **Screenshot** available as an alternative.

Choose the agent's text log, `.jsonl`, or output file using the native file picker. Desktop PA reads only that selected file, in read-only mode; its local preview refreshes every two seconds while the tab is visible. It reads at most the last 16 KB, strips terminal escape sequences, and redacts the configured API key and recognizable key strings. Disconnect stops the connection. Paths are kept in memory, never restored silently after restarting.

If the agent doesn't produce a log, enable its own output-logging option before connecting. Desktop PA does not attach to an arbitrary running Terminal session, launch commands, send keystrokes, or control Hermes. A changing file is not proof that its process is alive. Modified and sample timestamps are displayed explicitly.

Click **Review excerpt for analysis** to freeze the text shown. New file output cannot silently replace that frozen excerpt. Inspect it for private data, then **Approve & analyze** or **Approve & compare**. Only the approved excerpt (and the previous summary if comparing) is sent to Gemma. The local summary records that its source was a log; raw excerpts and file paths are not saved in analysis history. Status is a fallible interpretation of the supplied output, not hidden process access. You can discard an excerpt without sending it.

Run `npm run test:log:live` for opt-in real Gemma analysis/comparison of a controlled log fixture, without reading your actual terminal. Local tests cover bounded file reads, ANSI/key redaction, file replacement, frozen approvals, and raw-log-free persistence.


## License

Desktop PA is open source under the [MIT License](LICENSE).
