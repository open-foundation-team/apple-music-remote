import AppKit
import Foundation

struct MenuActions {
    let playPause: () -> Void
    let next: () -> Void
    let previous: () -> Void
    let openUI: () -> Void
    let quit: () -> Void
}

final class MenuBarController {
    private let statusItem: NSStatusItem
    private let menu: NSMenu
    private let playPauseItem: NSMenuItem
    private let nowPlayingItem: NSMenuItem
    private let serviceItem: NSMenuItem
    private let connectionItem: NSMenuItem
    private let tokenProvider: () -> String
    private let actions: MenuActions

    init(actions: MenuActions, tokenProvider: @escaping () -> String) {
        self.actions = actions
        self.tokenProvider = tokenProvider
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        self.menu = NSMenu()

        self.nowPlayingItem = NSMenuItem(title: "Not playing", action: nil, keyEquivalent: "")
        self.nowPlayingItem.isEnabled = false

        self.serviceItem = NSMenuItem(title: "Service: …", action: nil, keyEquivalent: "")
        self.serviceItem.isEnabled = false

        self.connectionItem = NSMenuItem(title: "Connections: 0", action: nil, keyEquivalent: "")
        self.connectionItem.isEnabled = false

        self.playPauseItem = NSMenuItem(title: "Play/Pause", action: #selector(handlePlayPause), keyEquivalent: "")
        self.playPauseItem.target = self

        let nextItem = NSMenuItem(title: "Next Track", action: #selector(handleNext), keyEquivalent: "")
        nextItem.target = self

        let previousItem = NSMenuItem(title: "Previous Track", action: #selector(handlePrevious), keyEquivalent: "")
        previousItem.target = self

        let openUIItem = NSMenuItem(title: "Open Web UI", action: #selector(handleOpenUI), keyEquivalent: "")
        openUIItem.target = self

        let copyTokenItem = NSMenuItem(title: "Copy Access Token", action: #selector(handleCopyToken), keyEquivalent: "")
        copyTokenItem.target = self

        let quitItem = NSMenuItem(title: "Quit", action: #selector(handleQuit), keyEquivalent: "")
        quitItem.target = self

        menu.addItem(nowPlayingItem)
        menu.addItem(serviceItem)
        menu.addItem(connectionItem)
        menu.addItem(.separator())
        menu.addItem(playPauseItem)
        menu.addItem(nextItem)
        menu.addItem(previousItem)
        menu.addItem(.separator())
        menu.addItem(openUIItem)
        menu.addItem(copyTokenItem)
        menu.addItem(.separator())
        menu.addItem(quitItem)

        statusItem.menu = menu
        statusItem.button?.title = " ♫"
    }

    func update(playback: PlaybackInfo?, configuration: ServerConfiguration, connections: ConnectionSummary) {
        DispatchQueue.main.async {
            if let playback = playback, let track = playback.track {
                // self.statusItem.button?.title = playback.isPlaying ? "\(track.title) ▶︎" : "\(track.title) ❚❚"
                self.nowPlayingItem.title = "\(track.title) — \(track.artist)"
                self.playPauseItem.title = playback.isPlaying ? "Pause" : "Play"
            } else {
                self.statusItem.button?.title = "♫"
                self.nowPlayingItem.title = "Not playing"
                self.playPauseItem.title = "Play"
            }

            self.serviceItem.title = "Service: \(configuration.serviceName) (\(configuration.port))"

            if let lastSeen = connections.lastSeen {
                let formatter = RelativeDateTimeFormatter()
                formatter.unitsStyle = .short
                let relative = formatter.localizedString(for: lastSeen, relativeTo: Date())
                self.connectionItem.title = "Connections: \(connections.activeClientCount) · \(relative)"
            } else {
                self.connectionItem.title = "Connections: \(connections.activeClientCount)"
            }
        }
    }

    // MARK: - Actions

    @objc private func handlePlayPause() {
        actions.playPause()
    }

    @objc private func handleNext() {
        actions.next()
    }

    @objc private func handlePrevious() {
        actions.previous()
    }

    @objc private func handleOpenUI() {
        actions.openUI()
    }

    @objc private func handleCopyToken() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(tokenProvider(), forType: .string)
    }

    @objc private func handleQuit() {
        actions.quit()
    }
}
