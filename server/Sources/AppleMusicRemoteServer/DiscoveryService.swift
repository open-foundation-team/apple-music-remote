import Foundation

final class DiscoveryService: NSObject, NetServiceDelegate {
    private let service: NetService
    private var txtRecords: [String: Data]

    init(name: String, port: Int32, version: String, requiresToken: Bool) {
        self.service = NetService(domain: "local.", type: "_amremote._tcp.", name: name, port: port)
        self.txtRecords = [
            "version": Data(version.utf8),
            "requiresToken": Data((requiresToken ? "1" : "0").utf8)
        ]
        super.init()
        service.includesPeerToPeer = true
        service.delegate = self
    }

    func start() {
        service.publish()
        updateTXTRecord()
    }

    func stop() {
        service.stop()
    }

    private func updateTXTRecord() {
        let data = NetService.data(fromTXTRecord: txtRecords)
        service.setTXTRecord(data)
    }

    func netService(_ sender: NetService, didNotPublish errorDict: [String : NSNumber]) {
        NSLog("NetService publish error: \(errorDict)")
    }
}
