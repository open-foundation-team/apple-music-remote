# Apple Music Remote

Apple Music Remote is a macOS menu bar application paired with a responsive web client that lets you control and monitor Music.app playback from any device on the local network.

## Features

- Swift-native menu bar helper that controls Music.app without stealing focus
- REST API with low-latency playback commands, progress polling, and both Music.app and system volume control
- Bonjour (`_amremote._tcp`) advertising for zero-config discovery
- Built-in authentication via a generated access token
- Responsive React UI tailored for phones, tablets, and touch kiosks
- Optional static hosting of the client bundle directly from the Swift server

## Quick Start

```bash
# Build the Swift server
cd server
swift build -c release

# Install and build the web client
cd ../client
npm install
npm run build
```

Launch `.build/release/AppleMusicRemoteServer` to start the menu bar helper, copy the access token from the status item, and open `http://<your-mac>:8777` on any device to use the web UI.

## Monorepo Layout

- `server/` – native Swift status bar app exposing the REST API, static file server, security, and Bonjour announce
- `client/` – React + TypeScript SPA built with Vite
- `docs/` – architecture overview, API reference, and operational guides

See `docs/overview.md` for a system architecture tour, `docs/api.md` for endpoint details, and `docs/usage.md` for build and deployment instructions.
# apple-music-remote
