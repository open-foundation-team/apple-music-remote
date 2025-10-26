import Foundation

final class StaticFileServer {
    private let roots: [URL]
    private let fallbackFile: String
    private let fileManager: FileManager

    init(configuration: ServerConfiguration, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        self.fallbackFile = "index.html"

        var searchRoots: [URL] = []
        var seen: Set<String> = []

        func appendRoot(_ url: URL) {
            let standardized = url.standardizedFileURL
            guard fileManager.fileExists(atPath: standardized.path) else { return }
            if seen.insert(standardized.path).inserted {
                searchRoots.append(standardized)
            }
        }

        let baseDirectories = StaticFileServer.computeBaseDirectories(fileManager: fileManager)

        for path in configuration.staticSearchPaths {
            if path.hasPrefix("/") {
                appendRoot(URL(fileURLWithPath: path))
            } else {
                for base in baseDirectories {
                    let candidate = URL(fileURLWithPath: path, relativeTo: base).standardizedFileURL
                    appendRoot(candidate)
                }
            }
        }

        if configuration.autoServeClient {
            for base in baseDirectories {
                for candidate in StaticFileServer.discoverClientBundle(startingAt: base, fileManager: fileManager) {
                    appendRoot(candidate)
                }
            }
        }

        if let resourceRoot = Bundle.module.resourceURL {
            let embedded = resourceRoot.appendingPathComponent("Public", isDirectory: true)
            appendRoot(embedded)
        }

        self.roots = searchRoots
    }

    func response(for request: HTTPRequest) -> HTTPResponse {
        guard request.method == .get else {
            return HTTPResponse(status: .methodNotAllowed)
        }

        let requestedPath = sanitize(path: request.path)
        let candidateFiles = buildCandidatePaths(for: requestedPath)

        for root in roots {
            for relative in candidateFiles {
                let fileURL = root.appendingPathComponent(relative.path, isDirectory: false)
                if isValid(fileURL: fileURL, under: root), fileManager.fileExists(atPath: fileURL.path) {
                    return load(fileURL: fileURL)
                }
            }
        }

        return HTTPResponse(
            status: .notFound,
            headers: ["Content-Type": "application/json"],
            body: Data("{\"error\":\"Not found\"}".utf8)
        )
    }

    private func sanitize(path: String) -> String {
        var trimmed = path
        if trimmed.hasPrefix("/") {
            trimmed.removeFirst()
        }
        return trimmed
    }

    private func buildCandidatePaths(for sanitizedPath: String) -> [CandidatePath] {
        var paths: [CandidatePath] = []
        if sanitizedPath.isEmpty {
            paths.append(CandidatePath(path: fallbackFile))
            return paths
        }

        let base = sanitizedPath.hasSuffix("/") ? sanitizedPath + fallbackFile : sanitizedPath
        paths.append(CandidatePath(path: base))

        // Single-page app fallback
        if base != fallbackFile {
            paths.append(CandidatePath(path: fallbackFile))
        }
        return paths
    }

    private func isValid(fileURL: URL, under root: URL) -> Bool {
        let standardized = fileURL.standardizedFileURL
        return standardized.path.hasPrefix(root.standardizedFileURL.path)
    }

    private func load(fileURL: URL) -> HTTPResponse {
        guard let data = try? Data(contentsOf: fileURL) else {
            return HTTPResponse(status: .internalServerError)
        }

        let ext = fileURL.pathExtension.lowercased()
        let contentType = StaticFileServer.mimeType(for: ext)

        return HTTPResponse(
            status: .ok,
            headers: [
                "Content-Type": contentType,
                "Cache-Control": "no-cache"
            ],
            body: data
        )
    }

    private struct CandidatePath {
        let path: String
    }

    private static func computeBaseDirectories(fileManager: FileManager) -> [URL] {
        var bases: [URL] = []
        var seen: Set<String> = []

        func addBase(_ url: URL) {
            let standardized = url.standardizedFileURL
            if seen.insert(standardized.path).inserted {
                bases.append(standardized)
            }
        }

        let cwd = URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)
        addBase(cwd)

        let bundleURL = Bundle.main.bundleURL
        let bundleBase = bundleURL.hasDirectoryPath ? bundleURL : bundleURL.deletingLastPathComponent()
        addBase(bundleBase)

        if let resourceURL = Bundle.main.resourceURL {
            addBase(resourceURL)
        }

        return bases
    }

    private static func discoverClientBundle(startingAt base: URL, fileManager: FileManager) -> [URL] {
        var results: [URL] = []
        var current = base.standardizedFileURL

        for _ in 0..<6 {
            let candidate = current.appendingPathComponent("client/dist", isDirectory: true)
            if fileManager.fileExists(atPath: candidate.path) {
                results.append(candidate)
            }
            var parent = current
            parent.deleteLastPathComponent()
            if parent.path == current.path || parent.path.isEmpty {
                break
            }
            current = parent
        }

        return results
    }

    private static func mimeType(for ext: String) -> String {
        switch ext {
        case "html": return "text/html; charset=utf-8"
        case "js": return "application/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "webp": return "image/webp"
        default: return "application/octet-stream"
        }
    }
}
