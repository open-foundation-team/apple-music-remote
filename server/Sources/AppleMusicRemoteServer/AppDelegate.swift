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
    private var discoveryService: DiscoveryService?
    private var menuController: MenuBarController!
    private var updateTimer: DispatchSourceTimer?
    private var lastPlayback: PlaybackInfo?

    func applicationDidFinishLaunching(_ notification: Notification) {
        configuration = configManager.loadConfiguration()
        securityManager = SecurityManager(configDirectory: configManager.configDirectory)
        let _ = securityManager.loadOrCreateToken()
        staticServer = StaticFileServer(configuration: configuration)

        router = RESTRouter(
            musicController: musicController,
            staticServer: staticServer,
            securityManager: securityManager,
            connectionTracker: connectionTracker,
            configuration: configuration,
            systemVolumeController: systemVolumeController
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
        startDiscovery()
        scheduleUpdates()
    }

    func applicationWillTerminate(_ notification: Notification) {
        updateTimer?.cancel()
        httpServer?.stop()
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
        let basePlayback = try? musicController.playbackInfo()
        let systemVolume = try? systemVolumeController.getVolume()
        let playback = basePlayback?.withSystemVolume(systemVolume)
        lastPlayback = playback
        let connections = connectionTracker.summary()
        menuController.update(playback: playback, configuration: configuration, connections: connections)
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
}
