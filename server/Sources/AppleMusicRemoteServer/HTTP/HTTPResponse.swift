import Foundation

struct HTTPResponse {
    let status: HTTPStatus
    var headers: [String: String]
    var body: Data

    init(status: HTTPStatus, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }
}

enum HTTPStatus: Int {
    case ok = 200
    case noContent = 204
    case badRequest = 400
    case unauthorized = 401
    case notFound = 404
    case methodNotAllowed = 405
    case internalServerError = 500

    var reasonPhrase: String {
        switch self {
        case .ok: return "OK"
        case .noContent: return "No Content"
        case .badRequest: return "Bad Request"
        case .unauthorized: return "Unauthorized"
        case .notFound: return "Not Found"
        case .methodNotAllowed: return "Method Not Allowed"
        case .internalServerError: return "Internal Server Error"
        }
    }
}
