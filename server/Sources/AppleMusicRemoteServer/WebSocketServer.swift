import Foundation
import Network

final class WebSocketServer {
    private final class ClientContext {
        let id: UUID
        let connection: NWConnection
        var isAuthenticated: Bool
        var lastActivity: Date
        let createdAt: Date

        init(id: UUID, connection: NWConnection, isAuthenticated: Bool, lastActivity: Date) {
            self.id = id
            self.connection = connection
            self.isAuthenticated = isAuthenticated
            self.lastActivity = lastActivity
            self.createdAt = Date()
        }
    }

    private let listener: NWListener
    private let queue = DispatchQueue(label: "WebSocketServerQueue")
    private let queueKey = DispatchSpecificKey<Void>()
    private var clients: [UUID: ClientContext] = [:]
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let securityManager: SecurityManager
    private let connectionTracker: ConnectionTracker
    private let playbackProvider: () throws -> PlaybackInfo
    private let executeCommand: (String) throws -> PlaybackInfo
    private let setMusicVolume: (Int) throws -> PlaybackInfo
    private let setSystemVolume: (Int) throws -> PlaybackInfo
    private let serverStatus: ServerStatus
    private var heartbeatTimer: DispatchSourceTimer?
    private let heartbeatInterval: TimeInterval = 20
    private let heartbeatTimeout: TimeInterval = 75
    private var lastBroadcast: PlaybackInfo?

    init(
        port: UInt16,
        securityManager: SecurityManager,
        connectionTracker: ConnectionTracker,
        serverStatus: ServerStatus,
        playbackProvider: @escaping () throws -> PlaybackInfo,
        executeCommand: @escaping (String) throws -> PlaybackInfo,
        setMusicVolume: @escaping (Int) throws -> PlaybackInfo,
        setSystemVolume: @escaping (Int) throws -> PlaybackInfo
    ) throws {
        guard let wsPort = NWEndpoint.Port(rawValue: port) else {
            throw HTTPServerError.malformedRequest
        }
        let parameters = NWParameters.tcp
        let options = NWProtocolWebSocket.Options()
        options.autoReplyPing = true
        parameters.defaultProtocolStack.applicationProtocols.insert(options, at: 0)

        self.listener = try NWListener(using: parameters, on: wsPort)
        self.securityManager = securityManager
        self.connectionTracker = connectionTracker
        self.serverStatus = serverStatus
        self.playbackProvider = playbackProvider
        self.executeCommand = executeCommand
        self.setMusicVolume = setMusicVolume
        self.setSystemVolume = setSystemVolume

        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601

        queue.setSpecific(key: queueKey, value: ())
    }

    func start() {
        listener.stateUpdateHandler = { state in
            if case .failed(let error) = state {
                NSLog("WebSocket listener failed: \(error)")
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection: connection)
        }
        listener.start(queue: queue)
        startHeartbeat()
    }

    func stop() {
        listener.cancel()
        heartbeatTimer?.cancel()
        heartbeatTimer = nil
        queue.sync {
            for (_, client) in clients {
                self.close(client: client, reason: "Server stopping")
            }
            clients.removeAll()
        }
    }

    func broadcastPlayback(_ info: PlaybackInfo?) {
        guard let info = info else { return }
        if DispatchQueue.getSpecific(key: queueKey) != nil {
            lastBroadcast = info
            for (id, client) in clients where client.isAuthenticated {
                send(message: .playback(info), to: id)
            }
        } else {
            queue.async {
                self.lastBroadcast = info
                for (id, client) in self.clients where client.isAuthenticated {
                    self.send(message: .playback(info), to: id)
                }
            }
        }
    }

    private func accept(connection: NWConnection) {
        let id = UUID()
        let client = ClientContext(id: id, connection: connection, isAuthenticated: false, lastActivity: Date())
        clients[id] = client

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.receive(on: client)
            case .failed(let error):
                NSLog("WebSocket connection failed: \(error)")
                self.queue.async {
                    self.removeClient(id: id)
                }
            case .cancelled:
                self.queue.async {
                    self.removeClient(id: id)
                }
            default:
                break
            }
        }

        connection.start(queue: queue)
    }

    private func receive(on client: ClientContext) {
        client.connection.receiveMessage { [weak self] data, context, _, error in
            guard let self else { return }
            if let error = error {
                NSLog("WebSocket receive error: \(error)")
                self.queue.async {
                    self.removeClient(id: client.id)
                }
                return
            }

            guard let metadata = context?.protocolMetadata(definition: NWProtocolWebSocket.definition) as? NWProtocolWebSocket.Metadata else {
                self.queue.async {
                    self.removeClient(id: client.id)
                }
                return
            }

            self.queue.async {
                self.handle(metadata: metadata, data: data, clientId: client.id)
            }

            if metadata.opcode != .close {
                self.receive(on: client)
            }
        }
    }

    private func handle(metadata: NWProtocolWebSocket.Metadata, data: Data?, clientId: UUID) {
        guard let client = clients[clientId] else { return }
        switch metadata.opcode {
        case .text:
            client.lastActivity = Date()
            guard let data = data else { return }
            do {
                let message = try decoder.decode(ClientMessage.self, from: data)
                handle(clientMessage: message, clientId: clientId)
            } catch {
                send(message: .error("Invalid message format"), to: clientId)
            }
        case .binary:
            send(message: .error("Binary frames not supported"), to: clientId)
        case .close:
            removeClient(id: clientId)
        case .pong:
            client.lastActivity = Date()
        case .ping:
            client.lastActivity = Date()
        default:
            break
        }
    }

    private func handle(clientMessage: ClientMessage, clientId: UUID) {
        guard let client = clients[clientId] else { return }
        switch clientMessage.type {
        case .auth:
            guard let token = clientMessage.token else {
                send(message: .auth(success: false, message: "Missing token"), to: clientId)
                close(client: client, reason: "Missing token")
                return
            }
            if securityManager.verify(requestToken: token) {
                client.isAuthenticated = true
                client.lastActivity = Date()
                connectionTracker.registerSuccess(endpoint: client.connection.endpoint)
                send(message: .auth(success: true, message: nil), to: clientId)
                send(message: .hello(status: serverStatus, heartbeatInterval: Int(heartbeatInterval)), to: clientId)
                do {
                    let playback = try playbackProvider()
                    lastBroadcast = playback
                    send(message: .playback(playback), to: clientId)
                } catch {
                    send(message: .error("Failed to load playback info"), to: clientId)
                }
            } else {
                send(message: .auth(success: false, message: "Invalid token"), to: clientId)
                close(client: client, reason: "Invalid token")
            }
        case .command:
            guard client.isAuthenticated else {
                send(message: .auth(success: false, message: "Authenticate first"), to: clientId)
                return
            }
            guard let action = clientMessage.action else {
                send(message: .error("Missing action", requestId: clientMessage.requestId), to: clientId)
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let playback = try self.executeCommand(action)
                    self.queue.async {
                        self.lastBroadcast = playback
                        self.send(message: .ack(action: action, requestId: clientMessage.requestId), to: clientId)
                        self.broadcastPlayback(playback)
                    }
                } catch {
                    self.queue.async {
                        self.send(message: .error("Command failed: \(error)", requestId: clientMessage.requestId), to: clientId)
                    }
                }
            }
        case .setVolume:
            guard client.isAuthenticated else {
                send(message: .auth(success: false, message: "Authenticate first"), to: clientId)
                return
            }
            guard let target = clientMessage.target, let value = clientMessage.value else {
                send(message: .error("Missing target or value", requestId: clientMessage.requestId), to: clientId)
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let playback: PlaybackInfo
                    switch target.lowercased() {
                    case "music":
                        playback = try self.setMusicVolume(value)
                    case "system":
                        playback = try self.setSystemVolume(value)
                    default:
                        self.queue.async {
                            self.send(message: .error("Unknown volume target", requestId: clientMessage.requestId), to: clientId)
                        }
                        return
                    }
                    self.queue.async {
                        self.lastBroadcast = playback
                        self.send(message: .ack(action: "setVolume:\(target)", requestId: clientMessage.requestId), to: clientId)
                        self.broadcastPlayback(playback)
                    }
                } catch {
                    self.queue.async {
                        self.send(message: .error("Volume update failed: \(error)", requestId: clientMessage.requestId), to: clientId)
                    }
                }
            }
        case .requestState:
            guard client.isAuthenticated else {
                send(message: .auth(success: false, message: "Authenticate first"), to: clientId)
                return
            }
            do {
                let playback = try playbackProvider()
                lastBroadcast = playback
                send(message: .playback(playback), to: clientId)
            } catch {
                send(message: .error("Failed to load playback info", requestId: clientMessage.requestId), to: clientId)
            }
        case .ping:
            send(message: .pong(), to: clientId)
        }
    }

    private func send(message: ServerMessage, to clientId: UUID) {
        guard let client = clients[clientId] else { return }
        do {
            let data = try encoder.encode(message)
            let metadata = NWProtocolWebSocket.Metadata(opcode: .text)
            let context = NWConnection.ContentContext(identifier: "text", metadata: [metadata])
            client.connection.send(content: data, contentContext: context, isComplete: true, completion: .contentProcessed { error in
                if let error = error {
                    NSLog("WebSocket send error: \(error)")
                }
            })
        } catch {
            NSLog("Failed to encode WebSocket message: \(error)")
        }
    }

    private func sendPing(to client: ClientContext) {
        let metadata = NWProtocolWebSocket.Metadata(opcode: .ping)
        let context = NWConnection.ContentContext(identifier: "ping", metadata: [metadata])
        client.connection.send(content: Data(), contentContext: context, isComplete: true, completion: .contentProcessed { error in
            if let error = error {
                NSLog("WebSocket ping error: \(error)")
            }
        })
    }

    private func startHeartbeat() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + heartbeatInterval, repeating: heartbeatInterval)
        timer.setEventHandler { [weak self] in
            self?.performHeartbeat()
        }
        timer.resume()
        heartbeatTimer = timer
    }

    private func performHeartbeat() {
        let now = Date()
        for (_, client) in clients {
            if !client.isAuthenticated {
                if now.timeIntervalSince(client.createdAt) > 10 {
                    close(client: client, reason: "Authentication timeout")
                }
                continue
            }
            let idleTime = now.timeIntervalSince(client.lastActivity)
            if idleTime > heartbeatTimeout {
                close(client: client, reason: "Heartbeat timeout")
            } else if idleTime > heartbeatInterval {
                sendPing(to: client)
            }
        }
    }

    private func removeClient(id: UUID) {
        guard let client = clients.removeValue(forKey: id) else { return }
        close(client: client, reason: nil, notify: false)
    }

    private func close(client: ClientContext, reason: String?, notify: Bool = true) {
        if notify {
            let metadata = NWProtocolWebSocket.Metadata(opcode: .close)
            let context = NWConnection.ContentContext(identifier: "close", metadata: [metadata])
            client.connection.send(content: Data(), contentContext: context, isComplete: true, completion: .idempotent)
        }
        client.connection.cancel()
        if let reason = reason {
            NSLog("Closing WebSocket client \(client.id): \(reason)")
        }
    }
}
