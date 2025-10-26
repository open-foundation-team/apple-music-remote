# REST API Reference

All API endpoints are exposed by the macOS menu bar application. By default the server listens on `http://localhost:8777`, but the port can be changed in `~/Library/Application Support/com.weekendprojects.apple-music-remote/config.json`.

- Base URL: `http://<host>:<port>`
- Authentication: include the access token in one of the following places:
  - Header `X-Amr-Token: <token>`
  - Header `Authorization: Bearer <token>`
  - Query string `?token=<token>` (not recommended for production)
- CORS: the server responds with permissive CORS headers and accepts `OPTIONS` pre-flight requests.

## Discovery

| Method | Endpoint | Description | Auth |
| ------ | -------- | ----------- | ---- |
| GET | `/api/ping` | Returns basic server metadata (name, version, port) | No |
| GET | `/api/discovery` | Mirrors `ping` but guarantees a JSON object for Bonjour consumers | No |

Example response:

```json
{
  "name": "Apple Music Remote",
  "version": "0.1.0",
  "port": 8777,
  "webSocketPort": 8778,
  "requiresToken": true
}
```

## Playback State

| Method | Endpoint | Description | Auth |
| ------ | -------- | ----------- | ---- |
| GET | `/api/state` | Fetches the latest playback information, including track metadata, progress, and volume | Yes |

Response payload:

```json
{
  "state": "playing",
  "track": {
    "title": "Song Title",
    "artist": "Artist Name",
    "album": "Album Name",
    "duration": 247,
    "artworkBase64": "iVBORw0KGgoAAAANSUhEUgAA..."
  },
  "progress": {
    "elapsed": 102.4,
    "duration": 247
  },
  "volume": 62,
  "systemVolume": 58,
  "timestamp": "2024-05-05T22:41:38.912Z"
}
```

`artworkBase64` is optional and omitted when Music.app does not provide artwork data.

When available, `systemVolume` reports the macOS output volume (0-100). If permissions are missing the field is omitted.

## Playback Control

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/api/play` | Start or resume playback |
| POST | `/api/pause` | Pause playback |
| POST | `/api/toggle` | Toggle between play and pause |
| POST | `/api/next` | Skip to the next track |
| POST | `/api/previous` | Jump to the previous track |

All control endpoints require authentication. Responses use HTTP `204 No Content` on success.

## Music Volume

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/volume` | Returns the current Music.app volume as `{ "volume": 0-100 }` |
| POST | `/api/volume` | Sets the Music.app volume. Body: `{ "volume": <0-100> }` |

## System Volume

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/system-volume` | Returns the macOS output volume as `{ "volume": 0-100 }` |
| POST | `/api/system-volume` | Sets the macOS output volume. Body: `{ "volume": <0-100> }` |

> System volume control may prompt macOS to request Accessibility permissions for Apple Music Remote. Grant access to allow remote control of output volume.

## WebSocket Protocol

- Endpoint: `ws://<host>:<webSocketPort>/`
- Authentication: send an `{"type":"auth","token":"<token>"}` message immediately after the socket opens. Connections that do not authenticate within 10 seconds are closed.
- Heartbeats: the server sends ping frames roughly every 20 seconds. Clients respond automatically (handled by browsers) and may optionally send an app-level `{ "type": "ping" }` message; the server replies with `{ "type": "pong" }`.

### Message Types (client → server)

| Type | Payload | Description |
| ---- | ------- | ----------- |
| `auth` | `{ "token": string }` | Authenticate the socket using the shared token |
| `command` | `{ "action": "play" \| "pause" \| "toggle" \| "next" \| "previous" }` | Playback control commands |
| `setVolume` | `{ "target": "music" \| "system", "value": number }` | Set either the Music.app or system volume (0-100) |
| `requestState` | _none_ | Request the latest playback snapshot |
| `ping` | _none_ | Optional application-level ping |

### Message Types (server → client)

| Type | Payload | Description |
| ---- | ------- | ----------- |
| `auth` | `{ "message": "ok" }` | Result of the authentication attempt |
| `hello` | `{ "server": ServerStatus, "heartbeatInterval": number }` | Sent after successful auth with heartbeat and metadata |
| `playback` | `{ "payload": PlaybackInfo }` | Current playback snapshot (sent on connect and whenever state changes) |
| `ack` | `{ "action": string }` | Acknowledgement that a command or volume change succeeded |
| `error` | `{ "message": string }` | An error occurred while processing a message |
| `pong` | _none_ | Response to an application-level ping |

## Static Content

Requests that do not begin with `/api/` are treated as static file lookups. The server searches for a built client bundle in:

1. `client/dist/` (relative to the repo root), if it exists
2. The embedded `Public/` resources packaged with the executable

Unknown routes fall back to `index.html`, enabling client-side routing.

## Error Codes

| Status | Meaning | Notes |
| ------ | ------- | ----- |
| 400 | Bad Request | Malformed JSON or unsupported payload |
| 401 | Unauthorized | Missing or incorrect token |
| 404 | Not Found | Invalid API path |
| 405 | Method Not Allowed | Non-supported HTTP verb |
| 500 | Internal Server Error | Unexpected Music.app or scripting failure |

Every error response includes a JSON body like `{ "error": "message" }`.
