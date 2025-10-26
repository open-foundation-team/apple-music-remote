import AppKit
import Network

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let configManager = ConfigManager()
    private var configuration: ServerConfiguration!
    private var securityManager: SecurityManager!
    private var staticServer: StaticFileServer!
    private let musicController = MusicController()
    private let systemVolumeController = SystemVolumeController()
    private let connectionTracker = ConnectionTracker()
    private var router: RESTRouter!
    private var httpServer: HTTPServer?
    private var webSocketServer: WebSocketServer?
    private var discoveryService: DiscoveryService?
    private var menuController: MenuBarController!
    private var updateTimer: DispatchSourceTimer?
    private var lastPlayback: PlaybackInfo?
    private var serverStatus: ServerStatus!

    func applicationDidFinishLaunching(_ notification: Notification) {
        configuration = configManager.loadConfiguration()
        securityManager = SecurityManager(configDirectory: configManager.configDirectory)
        let _ = securityManager.loadOrCreateToken()
        staticServer = StaticFileServer(configuration: configuration)

        serverStatus = ServerStatus(
            name: configuration.serviceName,
            version: ServerVersion,
            port: configuration.port,
            webSocketPort: configuration.webSocketPort,
            requiresToken: true
        )

        router = RESTRouter(
            musicController: musicController,
            staticServer: staticServer,
            securityManager: securityManager,
            connectionTracker: connectionTracker,
            configuration: configuration,
            systemVolumeController: systemVolumeController,
            serverStatus: serverStatus
        )

        menuController = MenuBarController(
            actions: MenuActions(
                playPause: { [weak self] in self?.performMenuAction { try $0.togglePlayPause() } },
                next: { [weak self] in self?.performMenuAction { try $0.nextTrack() } },
                previous: { [weak self] in self?.performMenuAction { try $0.previousTrack() } },
                openUI: { [weak self] in self?.openWebInterface() },
                quit: { NSApplication.shared.terminate(nil) }
            ),
            tokenProvider: { [weak self] in self?.securityManager.token ?? "" }
        )

        startServer()
        startWebSocketServer()
        startDiscovery()
        scheduleUpdates()
    }

    func applicationWillTerminate(_ notification: Notification) {
        updateTimer?.cancel()
        httpServer?.stop()
        webSocketServer?.stop()
        discoveryService?.stop()
    }

    // MARK: - Private helpers

    private func startServer() {
        do {
            let server = try HTTPServer(port: configuration.port) { [weak self] request in
                guard let self else {
                    return HTTPResponse(status: .internalServerError)
                }
                return self.router.handle(request)
            }
            server.start()
            httpServer = server
        } catch {
            presentFatalError("Unable to start HTTP server on port \(configuration.port): \(error)")
        }
    }

    private func startDiscovery() {
        let service = DiscoveryService(
            name: configuration.serviceName,
            port: Int32(configuration.port),
            webSocketPort: Int32(configuration.webSocketPort),
            version: ServerVersion,
            requiresToken: true
        )
        service.start()
        discoveryService = service
    }

    private func scheduleUpdates() {
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .userInitiated))
        timer.schedule(deadline: .now(), repeating: .seconds(3))
        timer.setEventHandler { [weak self] in
            self?.refreshPlayback()
        }
        timer.resume()
        updateTimer = timer
    }

    private func refreshPlayback() {
        let playback = try? capturePlaybackState()
        lastPlayback = playback
        let connections = connectionTracker.summary()
        menuController.update(playback: playback, configuration: configuration, connections: connections)
        if let playback = playback {
            webSocketServer?.broadcastPlayback(playback)
        }
    }

    private func performMenuAction(_ block: @escaping (MusicController) throws -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                try block(self.musicController)
                self.refreshPlayback()
            } catch {
                self.presentNonFatalError("Action failed: \(error)")
            }
        }
    }

    private func openWebInterface() {
        let urlString = "http://127.0.0.1:\(configuration.port)"
        if let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }

    private func presentFatalError(_ message: String) {
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.alertStyle = .critical
            alert.messageText = "Apple Music Remote"
            alert.informativeText = message
            alert.runModal()
            NSApplication.shared.terminate(nil)
        }
    }

    private func presentNonFatalError(_ message: String) {
        NSLog(message)
    }

    private func startWebSocketServer() {
        do {
            let server = try WebSocketServer(
                port: configuration.webSocketPort,
                securityManager: securityManager,
                connectionTracker: connectionTracker,
                serverStatus: serverStatus,
                playbackProvider: { [weak self] in
                    guard let self else { throw PlaybackStateError.unavailable }
                    return try self.capturePlaybackState()
                },
                executeCommand: { [weak self] action in
                    guard let self else { throw PlaybackStateError.unavailable }
                    let playback = try self.executeCommand(named: action)
                    DispatchQueue.main.async { [weak self] in self?.refreshPlayback() }
                    return playback
                },
                setMusicVolume: { [weak self] value in
                    guard let self else { throw PlaybackStateError.unavailable }
                    try self.musicController.setVolume(value)
                    let playback = try self.capturePlaybackState()
                    DispatchQueue.main.async { [weak self] in self?.refreshPlayback() }
                    return playback
                },
                setSystemVolume: { [weak self] value in
                    guard let self else { throw PlaybackStateError.unavailable }
                    try self.systemVolumeController.setVolume(value)
                    let playback = try self.capturePlaybackState()
                    DispatchQueue.main.async { [weak self] in self?.refreshPlayback() }
                    return playback
                }
            )
            server.start()
            webSocketServer = server
        } catch {
            presentNonFatalError("Unable to start WebSocket server: \(error)")
        }
    }

    private func capturePlaybackState() throws -> PlaybackInfo {
        let playback = try musicController.playbackInfo()
        let systemVolume = try? systemVolumeController.getVolume()
        return playback.withSystemVolume(systemVolume)
    }

    private func executeCommand(named action: String) throws -> PlaybackInfo {
        switch action.lowercased() {
        case "play":
            try musicController.play()
        case "pause":
            try musicController.pause()
        case "toggle":
            try musicController.togglePlayPause()
        case "next":
            try musicController.nextTrack()
        case "previous":
            try musicController.previousTrack()
        default:
            throw PlaybackStateError.unknownCommand
        }
        return try capturePlaybackState()
    }
}

private enum PlaybackStateError: Error {
    case unavailable
    case unknownCommand
}
