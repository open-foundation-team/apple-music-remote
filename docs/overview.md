# Architecture Overview

The Apple Music Remote system consists of a native macOS server application and a browser-based client UI. Both live in the same repository to simplify distribution and co-deployment.

## Components

- **Server (`server/`)**
  - Swift status bar app that controls Music.app via AppleScript.
  - Hosts a lightweight REST API for discovery/diagnostics and serves static assets.
  - Exposes a dedicated WebSocket listener for realtime playback updates and bidirectional control (including heartbeats and volume updates).
  - Serves the built client bundle for zero-config setup.
  - Advertises itself on the local network using Bonjour (`_amremote._tcp`).
  - Enforces a shared secret token for every control endpoint.

- **Client (`client/`)**
  - React + TypeScript single-page app built with Vite.
  - Discovers the server via Bonjour hostnames (e.g., `apple-music-remote.local`) and falls back to manual entry.
  - Provides responsive controls optimised for phones and small touch displays.
  - Establishes a WebSocket session for live playback snapshots, heartbeats, and control commands without relying on REST polling.

## Data Flow

1. The server launches, generates or loads an access token, starts the REST and WebSocket listeners, and publishes its presence via Bonjour.
2. Clients obtain the server base URL either through `.local` resolution or manual entry, then fetch `/api/ping` to learn the WebSocket port.
3. The browser connects to the WebSocket endpoint, authenticates with the shared token, and listens for realtime playback messages.
4. Playback commands and volume adjustments flow over the WebSocket and are translated into AppleScript instructions executed against Music.app or the system mixer.
5. Broadcast updates include track metadata, playback progress, Base64 album art, and volume levels, keeping every connected controller in sync.
6. The menu bar item reflects the latest playback state and displays connection health derived from authenticated REST or WebSocket activity.

Further details, including API contracts and configuration options, are documented in `docs/api.md`.
