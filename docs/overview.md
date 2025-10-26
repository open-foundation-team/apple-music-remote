# Architecture Overview

The Apple Music Remote system consists of a native macOS server application and a browser-based client UI. Both live in the same repository to simplify distribution and co-deployment.

## Components

- **Server (`server/`)**
  - Swift status bar app that controls Music.app via AppleScript.
  - Hosts a lightweight REST API for playback commands, volume control, and metadata queries.
  - Serves the built client bundle for zero-config setup.
  - Advertises itself on the local network using Bonjour (`_amremote._tcp`).
  - Enforces a shared secret token for every control endpoint.

- **Client (`client/`)**
  - React + TypeScript single-page app built with Vite.
  - Discovers the server via Bonjour hostnames (e.g., `apple-music-remote.local`) and falls back to manual entry.
  - Provides responsive controls optimised for phones and small touch displays.
  - Continuously polls the `/api/state` endpoint for live playback information.

## Data Flow

1. The server launches, generates or loads an access token, starts the REST listener, and publishes its presence via Bonjour.
2. Clients obtain the server base URL either through `.local` resolution or manual entry.
3. All HTTP requests include the `X-Amr-Token` header for authentication.
4. Playback commands are translated into AppleScript instructions executed against Music.app.
5. State queries return JSON that includes track metadata, playback progress, and Base64 album art when available.
6. The menu bar item reflects the latest playback state and displays connection health derived from authenticated requests in the recent window.

Further details, including API contracts and configuration options, are documented in `docs/api.md`.
