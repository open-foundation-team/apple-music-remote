import Foundation

final class RESTRouter {
    private let musicController: MusicController
    private let staticServer: StaticFileServer
    private let securityManager: SecurityManager
    private let connectionTracker: ConnectionTracker
    private let configuration: ServerConfiguration
    private let systemVolumeController: SystemVolumeController
    private let encoder: JSONEncoder
    private let version: String = ServerVersion

    init(
        musicController: MusicController,
        staticServer: StaticFileServer,
        securityManager: SecurityManager,
        connectionTracker: ConnectionTracker,
        configuration: ServerConfiguration,
        systemVolumeController: SystemVolumeController
    ) {
        self.musicController = musicController
        self.staticServer = staticServer
        self.securityManager = securityManager
        self.connectionTracker = connectionTracker
        self.configuration = configuration
        self.systemVolumeController = systemVolumeController

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder
    }

    func handle(_ request: HTTPRequest) -> HTTPResponse {
        if request.method == .options {
            return applyCORS(HTTPResponse(status: .noContent), for: request)
        }
        let response: HTTPResponse
        if request.path.hasPrefix("/api/") {
            response = handleAPI(request)
        } else {
            response = staticServer.response(for: request)
        }
        return applyCORS(response, for: request)
    }

    private func handleAPI(_ request: HTTPRequest) -> HTTPResponse {
        switch (request.method, request.path) {
        case (.get, "/api/ping"):
            return jsonResponse(ServerStatus(
                name: configuration.serviceName,
                version: version,
                port: configuration.port,
                requiresToken: true
            ))
        case (.get, "/api/discovery"):
            let payload: [String: Any] = [
                "name": configuration.serviceName,
                "port": configuration.port,
                "version": version,
                "requiresToken": true
            ]
            return jsonResponse(payload)
        case (.get, "/api/state"):
            return authenticated(request) {
                let info = try musicController.playbackInfo()
                let systemVolume = try? self.systemVolumeController.getVolume()
                return jsonResponse(info.withSystemVolume(systemVolume))
            }
        case (.post, "/api/play"):
            return authenticated(request) {
                try musicController.play()
                return HTTPResponse(status: .noContent)
            }
        case (.post, "/api/pause"):
            return authenticated(request) {
                try musicController.pause()
                return HTTPResponse(status: .noContent)
            }
        case (.post, "/api/toggle"):
            return authenticated(request) {
                try musicController.togglePlayPause()
                return HTTPResponse(status: .noContent)
            }
        case (.post, "/api/next"):
            return authenticated(request) {
                try musicController.nextTrack()
                return HTTPResponse(status: .noContent)
            }
        case (.post, "/api/previous"):
            return authenticated(request) {
                try musicController.previousTrack()
                return HTTPResponse(status: .noContent)
            }
        case (.get, "/api/volume"):
            return authenticated(request) {
                let volume = try musicController.getVolume()
                return jsonResponse(["volume": volume])
            }
        case (.post, "/api/volume"):
            return authenticated(request) {
                struct VolumePayload: Decodable {
                    let volume: Int
                }
                let payload = try request.decodeBody(as: VolumePayload.self)
                try musicController.setVolume(payload.volume)
                return HTTPResponse(status: .noContent)
            }
        case (.get, "/api/system-volume"):
            return authenticated(request) {
                let volume = try self.systemVolumeController.getVolume()
                return jsonResponse(["volume": volume])
            }
        case (.post, "/api/system-volume"):
            return authenticated(request) {
                struct SystemVolumePayload: Decodable {
                    let volume: Int
                }
                let payload = try request.decodeBody(as: SystemVolumePayload.self)
                try self.systemVolumeController.setVolume(payload.volume)
                return HTTPResponse(status: .noContent)
            }
        default:
            return HTTPResponse(
                status: .notFound,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"Endpoint not found\"}".utf8)
            )
        }
    }

    private func authenticated(_ request: HTTPRequest, action: () throws -> HTTPResponse) -> HTTPResponse {
        guard let headerToken = extractToken(from: request), securityManager.verify(requestToken: headerToken) else {
            return HTTPResponse(
                status: .unauthorized,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"Missing or invalid token\"}".utf8)
            )
        }

        do {
            let response = try action()
            connectionTracker.registerSuccess(endpoint: request.remoteEndpoint)
            return response
        } catch let error as MusicControllerError {
            let message: String
            switch error {
            case .scriptFailure(let text):
                message = text
            case .invalidResponse:
                message = "Invalid response from Music.app"
            }
            return HTTPResponse(
                status: .internalServerError,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"\(Self.escape(message))\"}".utf8)
            )
        } catch let error as SystemVolumeError {
            let message: String
            switch error {
            case .scriptFailure(let text):
                message = text
            case .invalidResponse:
                message = "Invalid response from system volume script"
            }
            return HTTPResponse(
                status: .internalServerError,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"\(Self.escape(message))\"}".utf8)
            )
        } catch HTTPServerError.invalidBody {
            return HTTPResponse(
                status: .badRequest,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"Invalid body\"}".utf8)
            )
        } catch {
            return HTTPResponse(
                status: .internalServerError,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"Unexpected server error\"}".utf8)
            )
        }
    }

    private func extractToken(from request: HTTPRequest) -> String? {
        if let bearer = request.headerValue("Authorization"),
           bearer.lowercased().hasPrefix("bearer ") {
            return String(bearer.dropFirst("bearer ".count))
        }
        if let header = request.headerValue("X-Amr-Token") {
            return header
        }
        if let queryToken = request.queryItems["token"] {
            return queryToken
        }
        return nil
    }

    private func jsonResponse<T: Encodable>(_ value: T) -> HTTPResponse {
        do {
            let data = try encoder.encode(value)
            return HTTPResponse(
                status: .ok,
                headers: ["Content-Type": "application/json"],
                body: data
            )
        } catch {
            return HTTPResponse(
                status: .internalServerError,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"Encoding failure\"}".utf8)
            )
        }
    }

    private func jsonResponse(_ dictionary: [String: Any]) -> HTTPResponse {
        if let data = try? JSONSerialization.data(withJSONObject: dictionary, options: [.prettyPrinted]) {
            return HTTPResponse(
                status: .ok,
                headers: ["Content-Type": "application/json"],
                body: data
            )
        }
        return HTTPResponse(
            status: .internalServerError,
            headers: ["Content-Type": "application/json"],
            body: Data("{\"error\":\"Encoding failure\"}".utf8)
        )
    }

    private static func escape(_ text: String) -> String {
        text
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
    }

    private func applyCORS(_ response: HTTPResponse, for request: HTTPRequest) -> HTTPResponse {
        var updated = response
        updated.headers["Access-Control-Allow-Origin"] = request.headerValue("Origin") ?? "*"
        updated.headers["Vary"] = "Origin"
        updated.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Amr-Token, Authorization"
        updated.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        updated.headers["Access-Control-Allow-Credentials"] = "false"
        return updated
    }
}
