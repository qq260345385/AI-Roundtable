# Changelog

## v0.6.1 internal alpha

- Moved web search and meeting start controls into the chat composer.
- Hardened web search toggle behavior while participant models are still loading.

## v0.6.0 internal alpha

- Added user-selectable search driver and summary model controls for web-enabled roundtables.
- Updated Tavily search defaults for China-oriented, text raw-content searches with larger candidate pools and best-evidence selection.
- Hardened evidence search debugging, timeout handling, localized Chinese source handling, and low-evidence meeting discipline.

## v0.5.3 internal alpha

- Added multi-pass Evidence Search diagnostics for localized Chinese sources, extraction attempts, and safer live-meeting search failure reporting.
- Improved Chinese topic relevance scoring, localized media source classification, and strong/weak coverage accounting.
- Added a minimal evidence-search debug endpoint for checking search health without starting a full meeting.

## v0.5.2 internal alpha

- Added an Evidence Rescue flow inspired by search-then-fetch patterns: broad search results now enter an internal candidate pool, sparse result sets can trigger Tavily Extract, and extracted content is rescored before Evidence Pack selection.
- Added `standard` and `deep` search modes while keeping the default UI simple; deep search gathers more candidates and extracts more URLs but still caps final evidence.
- Relaxed very-low scoring so relevant short snippets and unknown sources are not filtered solely because of source type or snippet length; low evidence remains context-only.

## v0.5.1 internal alpha

- Simplified participant model cards so the default UI shows the actual model id directly without extra display-name prefixes or duplicate model metadata.

## v0.5.0 internal alpha

- Added a pluggable `SearchProvider` interface and registry, with Tavily as the default built-in provider.
- Routed model-driven web search and direct evidence search through the provider abstraction while preserving Tavily cache, TTL, error handling, and dedupe behavior.
- Kept provider diagnostics out of default API/UI responses and exposed provider details only in `debugSearchProcess` and live-search smoke output.

## v0.4.4 internal alpha

- Added an in-memory Tavily query cache with TTLs for real-time, standard, and stable queries.
- Added URL canonicalization, tracking-parameter removal, duplicate URL merging, and same-domain limits before evidence pack creation.
- Kept cache and dedupe diagnostics out of default API/UI responses while exposing them in `debugSearchProcess` and live-search smoke output.

## v0.4.3 internal alpha

- Added internal citation levels for web evidence so high/medium sources can support factual claims while low sources remain context-only.
- Strengthened citation checks and summary quality gates so low-evidence citations are not kept as confirmable facts.
- Kept scoring, citation levels, and filter diagnostics out of default API/UI responses while preserving full details in server debug mode.

## v0.4.2.3 internal alpha

- Added compact `searchSummary` responses for web search status, evidence counts, and user-facing verification warnings.
- Stopped default meeting and evidence search API responses from returning full `searchProcess`, query plans, Tavily query lists, and filtered-result diagnostics.
- Moved full search diagnostics behind server-side debug mode: `SEARCH_DEBUG_ENABLED=true` and `NODE_ENV !== "production"`.

## v0.4.2.1 internal alpha

- Switched web search to a model-driven flow: participants propose search directions before the server runs Tavily.
- Lowered the evidence quality gate so low-reliability but non-empty sources can be used in low-evidence mode, while very low-quality sources are still filtered.
- Kept low-evidence warnings in prompts and Markdown so real-time claims remain marked for manual verification.

## v0.3.21 internal alpha

- Added Tavily-backed Web Evidence Pack search through `POST /api/evidence/search`.
- Added homepage UI for searching web evidence and merging results into the shared Evidence Pack.
- Kept web search server-side so Tavily API keys are never exposed to the browser or participant models.

## v0.3.20 internal alpha

- Added a live meeting endpoint that streams meeting progress as NDJSON events.
- Switched the start flow to enter the meeting room immediately after submission.
- Added participant live statuses and stage updates so completed turns appear during the meeting instead of only after the full result is ready.

## v0.3.19 internal alpha

- Replaced provider/model-name capability guessing with configurable provider capability declarations.
- Added `.env.local` support for document, image, and native-file capability metadata.
- Updated participant capability warnings so unknown capability is not shown as unsupported.

## v0.3.18 internal alpha

- Corrected DeepSeek V4 capability detection.
- DeepSeek V4 models are now marked as supporting document recognition while still showing no image recognition support.
- Added tests for provider/model-specific capability inference.

## v0.3.17 internal alpha

- Added model capability reminders beside participant names.
- Marked current generic OpenAI-compatible providers as not supporting native document or image recognition.
- Added reusable capability warning labels in Chinese and English.

## v0.3.16 internal alpha

- Added Evidence Pack delivery planning for native attachment intent versus text-pack fallback.
- Added provider capability metadata for native evidence attachments.
- Added UI and meeting result notices showing the actual evidence delivery mode.

## v0.3.15 internal alpha

- Added document input strategy metadata for Evidence Pack meetings.
- Added UI choices for native attachment intent, long text pack fallback, and auto mode.
- Increased local document text budgets so uploaded documents are no longer reduced to an 800-character evidence snippet by default.

## v0.3.14 internal alpha

- Added a dedicated meeting room view after a meeting starts.
- Added a council-member sidebar and stage-by-stage meeting content display.
- Added fixed stage switching controls with lightweight interaction animations.

## v0.3.13 internal alpha

- Added optional brief meeting mode for shorter participant turns.
- Passed brief mode through `/api/meeting` into provider prompts.
- Added brief mock responses and UI copy for the meeting form.

## v0.3.12 internal alpha

- Added app-level language settings for Chinese and English.
- Persisted the selected UI language in local browser storage.
- Hid the Next.js development tools indicator for a cleaner local UI.

## v0.3.11 internal alpha

- Added Evidence Pack preview before meetings.
- Added evidence quality metadata including text length, truncation status, and warnings.
- Added UI and Markdown output for evidence parsing/truncation warnings.

## v0.3.10 internal alpha

- Added local document evidence parsing for `.pdf`, `.docx`, `.xlsx`, and `.pptx` files.
- Added `POST /api/evidence/parse` for extracting document text into Evidence Pack drafts.
- Updated the Evidence Pack upload UI to parse selected documents before meetings.

## v0.3.9 internal alpha

- Replaced manual Evidence Pack field entry with local text file selection.
- Added local text import normalization and secret redaction tests.
- Kept Evidence Pack processing browser-local; no file storage, upload service, or search API was added.

## v0.3.8 internal alpha

- Added Evidence Citation Guard for `S1`-style citations.
- Added server-side citation checks to meeting results.
- Added Markdown and UI citation check output for invalid evidence ids.

## v0.3.7 internal alpha

- Added manual Evidence Pack input for shared meeting context.
- Added server-side evidence normalization and regenerated `S1`-style evidence ids.
- Injected evidence citation rules into model prompts.
- Added evidence source output to Markdown exports.

## v0.3.6 internal alpha

- Added time-sensitive topic detection for current/latest/ranking/price/version-style questions.
- Added fact hygiene prompts so models must mark uncertain current facts as unverified.
- Added UI and Markdown fact-check notices for time-sensitive meetings.

## v0.3.5 internal alpha

- Added real provider smoke test result notes with sensitive fields omitted.
- Kept the project in internal alpha / pre-release status.

## v0.3.4 internal

- Updated real-mode smoke test documentation and frontend manual checklist.
- Updated example notes for partial provider failure records.

## v0.3.3 internal

- Polished the meeting room interaction states.
- Added selectable participant models in the UI.
- Added lightweight hover and active-state interactions.
- Added `docs/frontend-manual-checklist.md`.

## v0.3.2 internal

- Improved partial failure display with Chinese stage names.
- Added short user-facing troubleshooting suggestions.
- Included failure suggestions in Markdown export.

## v0.3.1 internal

- Added meeting fault tolerance for partial provider failures.
- Preserved successful provider responses when another provider fails.
- Added `failures` and `hasPartialFailures` to meeting results.

## v0.3.0 internal

- Clarified mock and real provider status semantics.
- Added generic OpenAI-compatible provider configuration through `AI_ROUNDTABLE_PROVIDER_IDS`.
- Added provider `/models` detection, timeout handling, and sanitized detection errors.

## v0.2.5 alpha

- Added MIT `LICENSE`.
- Added `.env.example` for mock and real provider configuration.
- Added README sections for Quick Start, environment variables, provider configuration, and license.

## v0.2.4

- Prepared open source release materials.
- Added `CONTRIBUTING.md`.
- Added `SECURITY.md`.
- Added `docs/assets/README.md`.

## v0.2.3

- Added meeting result Markdown export.
- Added mock and real meeting example files.
- Added evaluation notes for meeting quality review.

## v0.2.2

- Added provider availability handling.
- Displayed unavailable real-mode providers.
- Added real model smoke test documentation.

## v0.2.1

- Connected the frontend meeting flow to backend API routes.

## v0.2

- Added real model integration layer.
- Added OpenAI-compatible provider support.

## v0.1

- Built the initial frontend meeting room.
- Added mock models.
- Added the three-phase meeting flow.
