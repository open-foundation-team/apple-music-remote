# Usage Guide

This guide walks through building the macOS menu bar server, generating the web client, and operating the full remote-control stack.

## 1. Prerequisites

- macOS 12 (Monterey) or newer
- Xcode 14+ command line tools (`xcode-select --install`)
- Node.js 18+ and npm 9+

## 2. Build the Server

The server is a Swift Package Manager project.

```bash
cd server
swift build -c release
```

The resulting binary lives under `.build/release/AppleMusicRemoteServer`. Launch it directly to start the menu bar app. On first launch the app will:

1. Generate an access token stored at `~/Library/Application Support/com.weekendprojects.apple-music-remote/access-token`
2. Persist a configuration file in the same directory (`config.json`)
3. Publish a Bonjour service `_amremote._tcp` with metadata for discovery

> **Tip:** Add the release binary to your Login Items if you want the helper to auto-start when you sign in.

## 3. Build the Web Client

```bash
cd client
npm install
npm run build
```

The build step outputs a production bundle in `client/dist/`. The server looks for this directory at runtime and serves it automatically. During development you can run `npm run dev` and let Vite proxy API calls to `http://localhost:8777`.

## 4. Running the Stack

1. Launch the Swift server (`swift run` for debug, or the release binary)
2. Use the menu bar icon to copy the access token
3. From another device on the same network, open `http://<mac-hostname>:8777`
4. Paste the token into the web UI when prompted

The web UI adapts to phone and tablet layouts and is touch-friendly for kiosk deployments (e.g. Raspberry Pi touchscreens running Chromium in kiosk mode).

## 5. Configuration

The configuration file supports the following keys:

```json
{
  "port": 8777,
  "serviceName": "Apple Music Remote",
  "autoServeClient": true,
  "staticSearchPaths": [
    "client/dist",
    "../client/dist",
    "../../client/dist"
  ]
}
```

- `port`: TCP port for the REST API and static assets
- `serviceName`: Displayed in the status menu and Bonjour broadcasts
- `autoServeClient`: When `true`, the server looks for a built web client bundle and serves it
- `staticSearchPaths`: Directories to scan (relative to the executable) before falling back to the embedded placeholder UI. With `autoServeClient` enabled the app also walks parent directories from the executable and working directory to locate `client/dist` automatically.

Modify the JSON and restart the server to apply changes.

## 6. Security

- Every control endpoint requires the shared access token
- Tokens are random 32-character strings stored on disk; delete the token file to force regeneration
- HTTP requests support `Authorization: Bearer <token>` or `X-Amr-Token`
- CORS is enabled for convenience when prototyping from alternate origins

For extra safety on shared networks you can enable system-level firewall rules limiting access to known devices.

## 7. Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Menu bar icon shows “Idle” | Ensure Apple Music is running or start playback from any source |
| Web UI stuck on “Access token required” | Copy the token via the menu bar `Copy Access Token` item |
| Web UI cannot connect | Confirm both the base URL and token, and check the System Firewall settings |
| System volume slider disabled | Approve the macOS Accessibility prompt for Apple Music Remote, then reload the page |
| Album art missing | Some tracks do not expose artwork through Music.app’s AppleScript interface |

Logs and errors are printed to the macOS Console app under the subsystem `AppleMusicRemoteServer`.
