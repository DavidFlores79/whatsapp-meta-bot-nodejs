<!-- Copilot instructions for contributors and automated agents -->
# Project snapshot

This repo implements a WhatsApp bot and minimal HTTP API that wires incoming WhatsApp Cloud webhook events to backend appointment APIs.

- App entry: `src/app.js` -> constructs `src/models/server.js` Server class which: sets up Express, static `public/`, body parsing, socket.io and routes.
- Routes: `src/routes/whatsappRoutes.js` mounted at `/api/v2` (WhatsApp webhook + appointment templates).
- Main controller: `src/controllers/whatsappController.js` handles verification (`verifyToken`), `receivedMessage` webhook dispatch, button/list interactions and file uploads.
- Messaging model builders: `src/shared/whatsappModels.js` contains builders (buildTextJSON, buildListJSON, buildTemplateJSON, buildButtonsJSON) — they return JSON strings the WhatsApp Cloud API expects.
- Transport: `src/services/whatsappService.js` sends raw JSON over HTTPS to the WhatsApp Cloud API (uses env vars for URI, VERSION, PHONE_ID, TOKEN).

# How to run (developer flows)

- Env-driven. Required env keys used across the app:  `PORT`, `MONGODB`, `WHATSAPP_URI`, `WHATSAPP_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_ADMIN`.
- Start locally (recommended for development):

  - npm run dev    # uses nodemon and `src/app` entry
  - npm start      # production: `node src/app`

- Note: `src/models/server.js` creates the http server and socket.io and immediately starts listening. The `listen()` method is intentionally a no-op; server is started in the constructor.

# Project-specific conventions & gotchas (important for an AI agent)

- Number formatting: phone handling assumes Mexico-style numbers. `src/shared/processMessage.js` uses a helper `formatNumber` that converts 13-digit inputs to `52` + last 10 digits. Agents should use `getLast10Digits()` before calling appointment endpoints.
- WhatsApp payload builders return JSON strings (not objects). Example flow: `const data = buildTemplateJSON(number, templateName, params); whatsappService.sendWhatsappResponse(data);`
- Controllers emit socket events via `req.io` (set in `src/models/server.js`). When mutating requests or instrumenting controllers, preserve `req.io` usage.
- Uploads use `connect-multiparty` and write to `./uploads` (see `src/routes/whatsappRoutes.js`). File-serving uses `getResource` endpoints that read `./uploads/<name>`.
- Error handling pattern: controllers often catch errors and either log them or convert them into a WhatsApp response using `getTextData()` + `whatsappService.sendWhatsappResponse()` — mirror that behavior when adding new controllers.
- Logging: the project writes a custom `logs.txt` via a Console instance in `src/controllers/whatsappController.js` — avoid removing or breaking that stream.

# Key files to reference when making edits

- Boot / infra: `src/app.js`, `src/models/server.js`, `src/database/config.js`
- Webhooks & controllers: `src/controllers/whatsappController.js` (method: `sendTemplateData`)
- Routes: `src/routes/whatsappRoutes.js` (POST `/api/v2/send`)
- Business / external calls: `src/services/whatsappService.js`, `src/services/socket.js`
- Message formats & helpers: `src/shared/whatsappModels.js`, `src/shared/processMessage.js`, `src/shared/helpers.js`, `src/shared/constants.js`

# Integration points and external dependencies

- WhatsApp Cloud API — send via HTTPS in `src/services/whatsappService.js` (uses env vars: WHATSAPP_*).
- MongoDB — `src/database/config.js` connects using `MONGODB` env var. The app sets `mongoose.set('strictQuery', false)`.

# Example patterns to mimic

- Sending a WhatsApp template:

  - Build parameters with `src/shared/whatsappModels.buildTemplateJSON(number, templateName, parameters)` (note: builder expects plain values and returns a string).
  - POST to `/api/v2/send` with the template data, handled by `sendTemplateData` in `src/controllers/whatsappController.js`.
  - Call `src/services/whatsappService.sendWhatsappResponse(dataString)`.

- Processing incoming messages: `src/controllers/whatsappController.js` receives webhooks -> uses `analizeText()` from `src/shared/processMessage.js` to analyze user input -> builds appropriate response using message builders -> sends via `whatsappService.sendWhatsappResponse(...)`.

# Small rules for automated code edits

- Preserve existing route path `/api/v2` and the multiparty upload directory `./uploads`.
- Avoid changing how message builders return payloads (they return JSON strings). If you refactor to return objects, update all call sites in controllers/services.
- Don't change how `req.io` is attached; tests and controllers expect it on the request.
- Keep number formatting utilities (`formatNumber`, `getLast10Digits`) unchanged unless you update all callers.

# Quick checklist for PRs an AI agent might open

- Run `npm run dev` locally and exercise webhook endpoints with sample payloads.
- Verify no routes are broken and file uploads still land under `uploads/`.
- If altering WhatsApp payloads, test against a sandbox WhatsApp Cloud instance.

If anything above is unclear or you want the instructions to emphasize different areas (tests, CI, environment examples), tell me which sections to expand and I’ll iterate.
