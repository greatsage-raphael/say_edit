# Say Edit | Speak. Edit. Done.

> **The Voice-First AI Workspace**
>
> *Click a region. Say what you want. Watch it change.*

## Table of Contents

- [Overview](#overview)
- [Workspaces](#workspaces)
  - [Document Navigator](#document-navigator)
  - [Image Editor](#image-editor)
  - [Compose Studio](#compose-studio)
- [Technical Architecture](#technical-architecture)
  - [The Voice Session Loop](#the-voice-session-loop)
  - [Document Intelligence Engine](#document-intelligence-engine)
  - [The Image Edit Loop](#the-image-edit-loop)
  - [Edit History Engine](#edit-history-engine)
- [Gemini Integration](#gemini-integration)
- [Directory Structure](#directory-structure)
- [Running the Application](#running-the-application)

---

## Overview

**Say Edit** replaces the not only the text box but the interface. Instead of hunting through text boxes, toolbars, sliders, and layer panels to edit your photos — or manually scrolling through hundred-page documents to learn from a pdf — you just speak.

The app routes to one of two purpose-built workspaces depending on what you load:

- **PDF?** → Drop it in and ask anything. Say Edit navigates to the exact passage and highlights it on the page.
- **Image?** → Click the area you want to change, say what you want, and watch the edit apply.

Under the hood, both workspaces run a persistent bi-directional **Gemini Live** voice session that listens continuously and acts the moment it understands your intent.

---

## Workspaces

### Document Navigator

Built for lawyers, researchers, and analysts who need to move fast through dense documents.

Upload any PDF and Say Edit indexes it at sentence level, embedding each chunk for semantic search. Once you initialize the voice session, you can ask any question about the document. Say Edit will:

1. Search the index for the most relevant passages.
2. Navigate the PDF to the correct page.
3. Apply yellow highlights over the exact sentences it's referencing.
4. Answer you by voice — grounded in the actual document text, never hallucinated.

You can ask broadly (*"What are the termination clauses?"*) or precisely (*"What does section 4.2 say about liability?"*) and the spatial highlight always follows.

> **Reindex** — If you want tighter, sentence-level highlighting, hit the Reindex button. Say Edit re-chunks the document at sentence granularity and polls until the new index is ready.

---

### Image Editor

A voice-first photo editor with a non-destructive history stack.

1. Upload any image.
2. Click anywhere on it to drop a crosshair hotspot at that pixel.
3. Speak your edit: *"Make the jacket leather"*, *"Blur the background"*, *"Add sunglasses."*
4. The current image and your coordinates are sent to the image generation model, which returns a localized edit.
5. The result is pushed onto the history stack — undo, redo, and compare are always available.

If you don't have a voice session running, a manual text input bar appears below the canvas whenever a hotspot is selected.

---

### Compose Studio

Combine two photos into a single composite — also by voice.

1. Your primary image is already loaded as **Image A**.
2. Switch to the **⬡ Compose** tab and drag in a second photo as **Image B**.
3. Describe the composite: *"Dress the model in the outfit from B"*, *"Put the product from A on the background from B."*
4. Say Edit generates the merged scene and adds it to your edit history, ready for further voice refinement in Edit mode.

You can also trigger compositing through the voice session by speaking naturally — the AI will prompt you to load Image B if it isn't already.

---

## Technical Architecture

### The Voice Session Loop

Both workspaces share the same core voice architecture: a persistent bi-directional WebSocket with the **Gemini Live API**.

- The browser streams `16kHz PCM` audio from the microphone in real time — no push-to-talk.
- The model listens continuously and calls the appropriate tool the moment it understands your intent.
- If you speak while the AI is responding, it stops and listens again. No waiting.
- A live scrolling transcript surfaces everything the AI says, with an animated waveform indicator when it's speaking.

```
Microphone → 16kHz PCM → Gemini Live WebSocket
       ↓
   Tool call (search_document / edit_image_region / compose_images)
       ↓
   Result returned → AI responds by voice + updates the workspace
```

---

### Document Intelligence Engine

```
PDF uploaded → chunked + embedded → stored in vector DB
       ↓
User speaks a question
       ↓
Gemini Live → search_document(query)
       ↓
Backend: semantic search → top-N sentence chunks + bounding boxes
       ↓
Gemini Live → focus_document_section(page, rects)
       ↓
PDF viewer jumps to page → yellow highlights applied over exact sentences
       ↓
AI answers by voice, grounded in the search results
```

**`search_document`** — Takes a natural language query, hits the backend vector search endpoint, and returns the most semantically relevant sentence chunks with their page numbers and bounding box coordinates.

**`focus_document_section`** — Takes a page number and an array of bounding boxes from the search results. Jumps the PDF viewer to that page and renders highlight overlays at the exact pixel positions of each sentence.

---

### The Image Edit Loop

```
User clicks region → crosshair appears at (x, y)
       ↓
User speaks: "make the shirt red"
       ↓
Gemini Live → edit_image_region(prompt, x, y)
       ↓
gemini-2.0-flash-exp-image-generation generates edited image
       ↓
History stack updated → canvas refreshes instantly
```

**`edit_image_region`** — Takes an edit prompt and pixel coordinates. Sends the current image as base64 alongside the instruction and coordinates to the image generation model, which returns a localized edit. The new image is pushed to history.

**`get_current_hotspot`** — Allows the model to query the currently selected region before triggering an edit, useful when the user speaks without clicking first.

**`compose_images`** — Takes a composition prompt, combines Image A (current history frame) and Image B (second slot), and calls the multi-image generation model to produce a realistic composite.

---

### Edit History Engine

Every edit — whether via voice or the manual text fallback — is non-destructive. Say Edit maintains a full linear history stack:

- **Undo** steps back to the previous version.
- **Redo** steps forward.
- **Compare** hold-to-preview shows the original image for instant before/after comparison.
- **Export** downloads the current version at full resolution.

History is stale-closure-safe: the session's async tool callbacks always read the current history index via refs, so rapid sequential edits never apply to stale frames.

---

## Gemini Integration

| Task | Model | Reason |
|:-----|:------|:--------|
| **Live Voice Session** | `gemini-2.5-flash-native-audio-preview` | Native audio modality — no STT pipeline, sub-300ms response latency |
| **Photo Editing** | `gemini-2.0-flash-exp-image-generation` | Localized instruction-following edits with pixel-coordinate context |
| **Image Compositing** | `gemini-2.0-flash-exp-image-generation` | Multi-image input for realistic composite scene generation |

---

## Directory Structure

### `/src/pages`
- `Glyphlanding.tsx` — Drag-and-drop entry point. Detects file type (PDF or image) and routes to the appropriate workspace.
- `GlyphWorkspace.tsx` — The PDF workspace. Owns the voice session lifecycle, document upload/reindex flow, semantic search tooling, and highlight rendering.
- `Glyphimageworkspace.tsx` — The image workspace. Owns the voice session, hotspot state, edit and compose tool handlers, and the history stack.


### `/src/utils`
- `audio.ts` — Low-level PCM audio utilities. Base64 decode/encode, `Float32Array` → `Int16Array` conversion, and `AudioBuffer` construction for the Web Audio API.

---

## Running the Application

This is a **Vite + React** project using **TypeScript** and **Tailwind CSS**.

```bash
npm install
```

### Environment Configuration

Create a `.env.local` file in the root:

```env
VITE_GEMINI_API_KEY=AIza...
VITE_BACKEND_URL=https://your-backend.run.app
```

> The backend (`VITE_BACKEND_URL`) powers document upload, indexing, and semantic search for the PDF workspace. The image workspace calls the Gemini API directly from the browser.

### Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Deploy to Google Cloud Run
```bash
gcloud run deploy say-edit \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-build-env-vars "VITE_GEMINI_API_KEY=AIza...,VITE_BACKEND_URL=https://..."
```

> **Note:** Vite bakes environment variables in at build time. The `Dockerfile` uses `ARG` injection to ensure `VITE_*` variables are present during `npm run build` inside the container.