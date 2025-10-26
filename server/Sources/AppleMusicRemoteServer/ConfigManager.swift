import Foundation

struct ServerConfiguration: Codable {
    var port: UInt16
    var serviceName: String
    var webSocketPort: UInt16
    var autoServeClient: Bool
    var staticSearchPaths: [String]

    static let `default` = ServerConfiguration(
        port: 8777,
        webSocketPort: 8778,
        serviceName: "Apple Music Remote",
        autoServeClient: true,
        staticSearchPaths: [
            "client/dist",
            "../client/dist",
            "../../client/dist"
        ]
    )

    enum CodingKeys: String, CodingKey {
        case port
        case webSocketPort
        case serviceName
        case autoServeClient
        case staticSearchPaths
    }

    init(
        port: UInt16,
        webSocketPort: UInt16,
        serviceName: String,
        autoServeClient: Bool,
        staticSearchPaths: [String]
    ) {
        self.port = port
        self.webSocketPort = webSocketPort
        self.serviceName = serviceName
        self.autoServeClient = autoServeClient
        self.staticSearchPaths = staticSearchPaths
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let port = try container.decode(UInt16.self, forKey: .port)
        self.port = port
        self.webSocketPort = try container.decodeIfPresent(UInt16.self, forKey: .webSocketPort) ?? port &+ 1
        self.serviceName = try container.decode(String.self, forKey: .serviceName)
        self.autoServeClient = try container.decodeIfPresent(Bool.self, forKey: .autoServeClient) ?? true
        self.staticSearchPaths = try container.decodeIfPresent([String].self, forKey: .staticSearchPaths) ?? ServerConfiguration.default.staticSearchPaths
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(port, forKey: .port)
        try container.encode(webSocketPort, forKey: .webSocketPort)
        try container.encode(serviceName, forKey: .serviceName)
        try container.encode(autoServeClient, forKey: .autoServeClient)
        try container.encode(staticSearchPaths, forKey: .staticSearchPaths)
    }
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
