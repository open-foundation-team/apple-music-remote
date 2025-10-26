import Foundation

enum ClientMessageType: String, Codable {
    case auth
    case command
    case setVolume
    case requestState
    case ping
}

struct ClientMessage: Codable {
    let type: ClientMessageType
    let token: String?
    let action: String?
    let target: String?
    let value: Int?
    let requestId: String?
}

enum ServerMessageType: String, Codable {
    case hello
    case auth
    case playback
    case ack
    case error
    case pong
}

struct ServerMessage: Codable {
    let type: ServerMessageType
    var message: String?
    var action: String?
    var payload: PlaybackInfo?
    var heartbeatInterval: Int?
    var server: ServerStatus?
    var requestId: String?

    static func hello(status: ServerStatus, heartbeatInterval: Int) -> ServerMessage {
        ServerMessage(
            type: .hello,
            message: nil,
            action: nil,
            payload: nil,
            heartbeatInterval: heartbeatInterval,
            server: status,
            requestId: nil
        )
    }

    static func auth(success: Bool, message: String?) -> ServerMessage {
        ServerMessage(
            type: .auth,
            message: success ? "ok" : (message ?? "unauthorized"),
            action: nil,
            payload: nil,
            heartbeatInterval: nil,
            server: nil,
            requestId: nil
        )
    }

    static func playback(_ info: PlaybackInfo) -> ServerMessage {
        ServerMessage(
            type: .playback,
            message: nil,
            action: nil,
            payload: info,
            heartbeatInterval: nil,
            server: nil,
            requestId: nil
        )
    }

    static func ack(action: String?, requestId: String?) -> ServerMessage {
        ServerMessage(
            type: .ack,
            message: "ok",
            action: action,
            payload: nil,
            heartbeatInterval: nil,
            server: nil,
            requestId: requestId
        )
    }

    static func error(_ text: String, requestId: String? = nil) -> ServerMessage {
        ServerMessage(
            type: .error,
            message: text,
            action: nil,
            payload: nil,
            heartbeatInterval: nil,
            server: nil,
            requestId: requestId
        )
    }

    static func pong() -> ServerMessage {
        ServerMessage(
            type: .pong,
            message: nil,
            action: nil,
            payload: nil,
            heartbeatInterval: nil,
            server: nil,
            requestId: nil
        )
    }
}
