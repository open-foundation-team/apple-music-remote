import Foundation

enum MusicControllerError: Error {
    case scriptFailure(String)
    case invalidResponse
}

final class MusicController {
    private let queue = DispatchQueue(label: "MusicControllerQueue", qos: .userInitiated)

    func play() throws {
        try runScript("""
        if application "Music" is running then
            tell application "Music" to play
        else
            tell application "Music" to play
        end if
        """)
    }

    func pause() throws {
        try runScript("""
        if application "Music" is running then
            tell application "Music" to pause
        end if
        """)
    }

    func togglePlayPause() throws {
        try runScript("""
        if application "Music" is running then
            tell application "Music" to playpause
        else
            tell application "Music" to play
        end if
        """)
    }

    func nextTrack() throws {
        try runScript("""
        if application "Music" is running then
            tell application "Music" to next track
        end if
        """)
    }

    func previousTrack() throws {
        try runScript("""
        if application "Music" is running then
            tell application "Music" to previous track
        end if
        """)
    }

    func setVolume(_ value: Int) throws {
        let clamped = max(0, min(100, value))
        try runScript("""
        tell application "Music"
            set sound volume to \(clamped)
        end tell
        """)
    }

    func getVolume() throws -> Int {
        try queue.sync {
            try fetchVolumeLocked()
        }
    }

    func playbackInfo() throws -> PlaybackInfo {
        try queue.sync {
            let state = try fetchPlayerState()
            let volume = (try? fetchVolumeLocked()) ?? 0

            guard state == .playing || state == .paused else {
                return PlaybackInfo(
                    state: state,
                    track: nil,
                    progress: nil,
                    volume: volume < 0 ? 0 : volume,
                    systemVolume: nil,
                    timestamp: Date()
                )
            }

            let trackPayload = try fetchTrackEnvelope()
            let track = TrackInfo(
                title: trackPayload.title,
                artist: trackPayload.artist,
                album: trackPayload.album,
                duration: trackPayload.duration,
                artworkBase64: trackPayload.artworkBase64
            )
            let progress = ProgressInfo(
                elapsed: trackPayload.position,
                duration: trackPayload.duration
            )

            return PlaybackInfo(
                state: state,
                track: track,
                progress: progress,
                volume: volume < 0 ? 0 : volume,
                systemVolume: nil,
                timestamp: Date()
            )
        }
    }

    // MARK: - Private Helpers

    private func fetchPlayerState() throws -> PlayerState {
        let script = """
        if application "Music" is running then
            tell application "Music" to return player state as string
        else
            return "stopped"
        end if
        """
        let descriptor = try execute(script: script)
        guard let value = descriptor?.stringValue?.lowercased() else {
            throw MusicControllerError.invalidResponse
        }
        switch value {
        case "playing":
            return .playing
        case "paused":
            return .paused
        default:
            return .stopped
        }
    }

    private func fetchVolumeLocked() throws -> Int {
        let script = """
        if application "Music" is running then
            tell application "Music" to return sound volume as integer
        else
            return -1
        end if
        """
        let descriptor = try execute(script: script)
        guard let value = descriptor?.int32Value else {
            throw MusicControllerError.invalidResponse
        }
        return Int(value)
    }

    private struct TrackEnvelope {
        let title: String
        let artist: String
        let album: String
        let duration: TimeInterval
        let position: TimeInterval
        let artworkBase64: String?
    }

    private func fetchTrackEnvelope() throws -> TrackEnvelope {
        let script = """
        if application "Music" is running then
            tell application "Music"
                if not (exists current track) then
                    return {}
                end if
                set trackName to name of current track
                set artistName to artist of current track
                set albumName to album of current track
                set durationSeconds to duration of current track
                set positionSeconds to player position
                set artData to missing value
                try
                    set artData to data of artwork 1 of current track
                end try
                return {trackName, artistName, albumName, durationSeconds, positionSeconds, artData}
            end tell
        end if
        return {}
        """

        guard let descriptor = try execute(script: script),
              descriptor.numberOfItems >= 5 else {
            throw MusicControllerError.invalidResponse
        }

        guard let title = descriptor.atIndex(1)?.stringValue,
              let artist = descriptor.atIndex(2)?.stringValue,
              let album = descriptor.atIndex(3)?.stringValue else {
            throw MusicControllerError.invalidResponse
        }

        let durationDescriptor = descriptor.atIndex(4)
        let positionDescriptor = descriptor.atIndex(5)

        let duration = durationDescriptor?.doubleValue ?? 0
        let position = positionDescriptor?.doubleValue ?? 0

        var artworkBase64: String? = nil
        if descriptor.numberOfItems >= 6,
           let artworkDescriptor = descriptor.atIndex(6) {
            let data = artworkDescriptor.data
            if !data.isEmpty {
                artworkBase64 = data.base64EncodedString()
            }
        }

        return TrackEnvelope(
            title: title,
            artist: artist,
            album: album,
            duration: duration,
            position: position,
            artworkBase64: artworkBase64
        )
    }

    private func runScript(_ source: String) throws {
        try queue.sync {
            _ = try execute(script: source)
        }
    }

    private func execute(script source: String) throws -> NSAppleEventDescriptor? {
        guard let script = NSAppleScript(source: source) else {
            throw MusicControllerError.scriptFailure("Unable to compile script")
        }
        var errorDict: NSDictionary?
        let result = script.executeAndReturnError(&errorDict)
        if let errorDict = errorDict {
            let message = errorDict[NSAppleScript.errorMessage] as? String ?? "Unknown error"
            throw MusicControllerError.scriptFailure(message)
        }
        return result
    }
}
