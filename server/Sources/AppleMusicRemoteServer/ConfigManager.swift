import Foundation

struct ServerConfiguration: Codable {
    var port: UInt16
    var serviceName: String
    var autoServeClient: Bool
    var staticSearchPaths: [String]

    static let `default` = ServerConfiguration(
        port: 8777,
        serviceName: "Apple Music Remote",
        autoServeClient: true,
        staticSearchPaths: [
            "client/dist",
            "../client/dist",
            "../../client/dist"
        ]
    )
}

final class ConfigManager {
    private enum Constants {
        static let bundleIdentifier = "com.weekendprojects.apple-music-remote"
        static let configFileName = "config.json"
    }

    let configDirectory: URL
    private let fileURL: URL
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    private let decoder = JSONDecoder()

    init(fileManager: FileManager = .default) {
        let baseDirectory: URL
        if let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            baseDirectory = appSupport.appendingPathComponent(Constants.bundleIdentifier, isDirectory: true)
        } else {
            baseDirectory = URL(fileURLWithPath: ("~/.\(Constants.bundleIdentifier)").expandingTildeInPath, isDirectory: true)
        }

        self.configDirectory = baseDirectory
        self.fileURL = baseDirectory.appendingPathComponent(Constants.configFileName, isDirectory: false)

        if !fileManager.fileExists(atPath: baseDirectory.path) {
            try? fileManager.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
        }
    }

    func loadConfiguration() -> ServerConfiguration {
        let fm = FileManager.default
        guard fm.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL),
              let config = try? decoder.decode(ServerConfiguration.self, from: data) else {
            let config = ServerConfiguration.default
            save(config)
            return config
        }
        return config
    }

    func save(_ configuration: ServerConfiguration) {
        do {
            let data = try encoder.encode(configuration)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            NSLog("Failed to persist configuration: \(error)")
        }
    }
}

private extension String {
    var expandingTildeInPath: String {
        (self as NSString).expandingTildeInPath
    }
}
