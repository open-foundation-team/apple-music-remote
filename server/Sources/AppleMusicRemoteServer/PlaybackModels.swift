import Foundation

enum PlayerState: String, Codable {
    case playing
    case paused
    case stopped
}

struct TrackInfo: Codable {
    let title: String
    let artist: String
    let album: String
    let duration: TimeInterval
    let artworkBase64: String?
}

struct ProgressInfo: Codable {
    let elapsed: TimeInterval
    let duration: TimeInterval
}

struct PlaybackInfo: Codable {
    let state: PlayerState
    let track: TrackInfo?
    let progress: ProgressInfo?
    let volume: Int
    let systemVolume: Int?
    let timestamp: Date

    var isPlaying: Bool {
        state == .playing
    }
}

struct ServerStatus: Codable {
    let name: String
    let version: String
    let port: UInt16
    let webSocketPort: UInt16
    let requiresToken: Bool
}

extension PlaybackInfo {
    func withSystemVolume(_ value: Int?) -> PlaybackInfo {
        PlaybackInfo(
            state: state,
            track: track,
            progress: progress,
            volume: volume,
            systemVolume: value ?? systemVolume,
            timestamp: timestamp
        )
    }
}
