import Foundation

final class SecurityManager {
    private enum Constants {
        static let tokenFileName = "access-token"
        static let tokenLength = 32
    }

    private let tokenURL: URL
    private(set) var token: String
    private let queue = DispatchQueue(label: "SecurityManagerQueue", qos: .utility)

    init(configDirectory: URL, fileManager: FileManager = .default) {
        self.tokenURL = configDirectory.appendingPathComponent(Constants.tokenFileName, isDirectory: false)
        if !fileManager.fileExists(atPath: configDirectory.path) {
            try? fileManager.createDirectory(at: configDirectory, withIntermediateDirectories: true)
        }
        self.token = ""
    }

    func loadOrCreateToken() -> String {
        queue.sync {
            if token.isEmpty {
                if let existing = try? String(contentsOf: tokenURL, encoding: .utf8),
                   !existing.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    token = existing.trimmingCharacters(in: .whitespacesAndNewlines)
                } else {
                    token = Self.generateToken()
                    do {
                        try token.write(to: tokenURL, atomically: true, encoding: .utf8)
                    } catch {
                        NSLog("Failed to persist access token: \(error)")
                    }
                }
            }
            return token
        }
    }

    func verify(requestToken: String?) -> Bool {
        guard let candidate = requestToken?.trimmingCharacters(in: .whitespacesAndNewlines), !candidate.isEmpty else {
            return false
        }
        return queue.sync {
            if token.isEmpty {
                token = loadOrCreateToken()
            }
            return secureCompare(candidate, token)
        }
    }

    func secureCompare(_ lhs: String, _ rhs: String) -> Bool {
        guard let leftData = lhs.data(using: .utf8),
              let rightData = rhs.data(using: .utf8) else {
            return false
        }
        var difference = UInt8(leftData.count ^ rightData.count)
        for i in 0..<min(leftData.count, rightData.count) {
            difference |= leftData[i] ^ rightData[i]
        }
        return difference == 0
    }

    private static func generateToken() -> String {
        let characters = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        var token = ""
        token.reserveCapacity(Constants.tokenLength)
        var generator = SystemRandomNumberGenerator()
        for _ in 0..<Constants.tokenLength {
            if let char = characters.randomElement(using: &generator) {
                token.append(char)
            }
        }
        return token
    }
}
