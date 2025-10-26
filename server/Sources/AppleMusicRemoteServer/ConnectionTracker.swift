import Foundation
import Network

struct ConnectionSummary {
    let activeClientCount: Int
    let lastSeen: Date?
}

final class ConnectionTracker {
    private var clients: [String: Date] = [:]
    private let queue = DispatchQueue(label: "ConnectionTrackerQueue", qos: .utility)
    private let activityWindow: TimeInterval

    init(activityWindow: TimeInterval = 300) {
        self.activityWindow = activityWindow
    }

    func registerSuccess(endpoint: NWEndpoint?) {
        let identifier = endpoint.flatMap { ConnectionTracker.describe(endpoint: $0) } ?? "unknown"
        queue.async {
            self.clients[identifier] = Date()
            self.pruneLocked()
        }
    }

    func summary() -> ConnectionSummary {
        queue.sync {
            pruneLocked()
            let lastSeen = clients.values.max()
            return ConnectionSummary(activeClientCount: clients.count, lastSeen: lastSeen)
        }
    }

    private func pruneLocked() {
        let cutoff = Date().addingTimeInterval(-activityWindow)
        clients = clients.filter { $0.value >= cutoff }
    }

    private static func describe(endpoint: NWEndpoint) -> String {
        switch endpoint {
        case .hostPort(let host, let port):
            return "\(host):\(port)"
        case .service(let name, let type, let domain, _):
            return "\(name).\(type).\(domain)"
        case .unix(let path):
            return path
        case .url(let url):
            return url.absoluteString
        case .opaque(let opaqueEndpoint):
            return "opaque:\(opaqueEndpoint)"
        @unknown default:
            return "unknown"
        }
    }
}
