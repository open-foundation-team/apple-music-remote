import Foundation
import Network

enum HTTPServerError: Error {
    case malformedRequest
    case invalidBody
    case unsupportedMethod
}

final class HTTPServer {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "HTTPServerQueue")
    private let handler: (HTTPRequest) -> HTTPResponse
    private var isRunning = false

    init(port: UInt16, handler: @escaping (HTTPRequest) -> HTTPResponse) throws {
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            throw HTTPServerError.malformedRequest
        }
        let parameters = NWParameters.tcp
        self.listener = try NWListener(using: parameters, on: nwPort)
        self.handler = handler
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        listener.stateUpdateHandler = { state in
            switch state {
            case .failed(let error):
                NSLog("HTTP listener failed: \(error)")
            default:
                break
            }
        }

        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection: connection)
        }

        listener.start(queue: queue)
    }

    func stop() {
        listener.cancel()
    }

    private func handle(connection: NWConnection) {
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                self.receive(on: connection, context: ConnectionContext(endpoint: connection.endpoint))
            case .failed(let error):
                NSLog("Connection failed: \(error)")
                connection.cancel()
            case .cancelled:
                break
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private func receive(on connection: NWConnection, context: ConnectionContext) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { data, _, isComplete, error in
            if let data = data, !data.isEmpty {
                context.buffer.append(data)
            }

            if isComplete {
                _ = self.processBuffer(context: context, connection: connection)
                return
            }

            if let error = error {
                NSLog("Receive error: \(error)")
                connection.cancel()
                return
            }

            if self.processBuffer(context: context, connection: connection) {
                return
            }

            self.receive(on: connection, context: context)
        }
    }

    @discardableResult
    private func processBuffer(context: ConnectionContext, connection: NWConnection) -> Bool {
        do {
            let request = try context.attemptRequest()
            if let request = request {
                let response = handler(request)
                send(response: response, over: connection)
                return true
            }
        } catch {
            let response = HTTPResponse(
                status: .badRequest,
                headers: ["Content-Type": "application/json"],
                body: Data("{\"error\":\"Malformed request\"}".utf8)
            )
            send(response: response, over: connection)
            return true
        }
        return false
    }

    private func send(response: HTTPResponse, over connection: NWConnection) {
        var headers = response.headers
        headers["Date"] = HTTPServer.dateFormatter.string(from: Date())
        headers["Connection"] = "close"
        if headers["Content-Length"] == nil {
            headers["Content-Length"] = "\(response.body.count)"
        }

        var headerLines = ["HTTP/1.1 \(response.status.rawValue) \(response.status.reasonPhrase)"]
        for (key, value) in headers {
            headerLines.append("\(key): \(value)")
        }
        headerLines.append("") // blank line

        var data = Data(headerLines.joined(separator: "\r\n").utf8)
        data.append(Data("\r\n".utf8))
        data.append(response.body)

        connection.send(content: data, completion: .contentProcessed { error in
            if let error = error {
                NSLog("Send error: \(error)")
            }
            connection.cancel()
        })
    }
}

private final class ConnectionContext {
    private enum Constants {
        static let headerDelimiter = Data("\r\n\r\n".utf8)
    }

    var buffer = Data()
    private(set) var header: RequestHead?
    private(set) var endpoint: NWEndpoint?

    init(endpoint: NWEndpoint?) {
        self.endpoint = endpoint
    }

    func attemptRequest() throws -> HTTPRequest? {
        if header == nil {
            guard let range = buffer.range(of: Constants.headerDelimiter) else {
                return nil
            }
            let headerData = buffer[..<range.lowerBound]
            let remainder = buffer[range.upperBound...]

            let head = try parseHeader(data: headerData)
            header = head
            buffer = Data(remainder)
        }

        guard let head = header else {
            return nil
        }

        let expectedLength = head.contentLength
        if buffer.count < expectedLength {
            return nil
        }

        let body = Data(buffer.prefix(expectedLength))
        // Remove used bytes
        buffer.removeFirst(expectedLength)

        let request = HTTPRequest(
            method: head.method,
            path: head.path,
            queryItems: head.queryItems,
            headers: head.headers,
            body: body,
            remoteEndpoint: endpoint
        )
        header = nil
        return request
    }

    private func parseHeader(data: Data) throws -> RequestHead {
        guard let headerString = String(data: data, encoding: .utf8) else {
            throw HTTPServerError.malformedRequest
        }
        let lines = headerString.split(separator: "\r\n", omittingEmptySubsequences: false)
        guard let requestLine = lines.first else {
            throw HTTPServerError.malformedRequest
        }

        let components = requestLine.split(separator: " ")
        guard components.count >= 3,
              let method = HTTPMethod(raw: String(components[0])) else {
            throw HTTPServerError.malformedRequest
        }

        let target = String(components[1])
        let version = String(components[2])

        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard !line.isEmpty else { continue }
            let parts = line.split(separator: ":", maxSplits: 1)
            guard parts.count == 2 else { continue }
            let key = parts[0].trimmingCharacters(in: .whitespaces)
            let value = parts[1].trimmingCharacters(in: .whitespaces)
            headers[key] = value
        }

        var path = target
        var query: [String: String] = [:]
        if let urlComponents = URLComponents(string: target) {
            path = urlComponents.path.isEmpty ? "/" : urlComponents.path
            if let items = urlComponents.queryItems {
                for item in items {
                    if let value = item.value {
                        query[item.name] = value
                    }
                }
            }
        }

        let length: Int
        if let contentLength = headers.first(where: { $0.key.caseInsensitiveCompare("Content-Length") == .orderedSame })?.value,
           let parsed = Int(contentLength) {
            length = parsed
        } else {
            length = 0
        }

        return RequestHead(
            method: method,
            path: path,
            version: version,
            headers: headers,
            queryItems: query,
            contentLength: length
        )
    }
}

private struct RequestHead {
    let method: HTTPMethod
    let path: String
    let version: String
    let headers: [String: String]
    let queryItems: [String: String]
    let contentLength: Int
}

private extension HTTPServer {
    static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE',' dd MMM yyyy HH':'mm':'ss 'GMT'"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()
}
