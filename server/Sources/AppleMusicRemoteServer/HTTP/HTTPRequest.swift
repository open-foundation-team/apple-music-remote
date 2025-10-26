import Foundation
import Network

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case options = "OPTIONS"

    init?(raw: String) {
        switch raw.uppercased() {
        case "GET": self = .get
        case "POST": self = .post
        case "PUT": self = .put
        case "DELETE": self = .delete
        case "OPTIONS": self = .options
        default: return nil
        }
    }
}

struct HTTPRequest {
    let method: HTTPMethod
    let path: String
    let queryItems: [String: String]
    let headers: [String: String]
    let body: Data
    let remoteEndpoint: NWEndpoint?

    func headerValue(_ key: String) -> String? {
        headers.first { $0.key.caseInsensitiveCompare(key) == .orderedSame }?.value
    }

    func decodeBody<T: Decodable>(as type: T.Type = T.self, decoder: JSONDecoder = JSONDecoder()) throws -> T {
        do {
            return try decoder.decode(T.self, from: body)
        } catch {
            throw HTTPServerError.invalidBody
        }
    }
}
