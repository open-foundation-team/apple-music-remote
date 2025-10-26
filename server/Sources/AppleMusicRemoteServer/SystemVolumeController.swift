import Foundation

enum SystemVolumeError: Error {
    case scriptFailure(String)
    case invalidResponse
}

final class SystemVolumeController {
    private let queue = DispatchQueue(label: "SystemVolumeControllerQueue", qos: .userInitiated)

    func getVolume() throws -> Int {
        try queue.sync {
            let script = """
            set volumeSettings to get volume settings
            return output volume of volumeSettings
            """
            let descriptor = try execute(script: script)
            guard let value = descriptor?.int32Value else {
                throw SystemVolumeError.invalidResponse
            }
            return max(0, min(100, Int(value)))
        }
    }

    func setVolume(_ value: Int) throws {
        let clamped = max(0, min(100, value))
        try queue.sync {
            let script = "set volume output volume \(clamped)"
            _ = try execute(script: script)
        }
    }

    private func execute(script source: String) throws -> NSAppleEventDescriptor? {
        guard let script = NSAppleScript(source: source) else {
            throw SystemVolumeError.scriptFailure("Unable to compile script")
        }
        var errorDict: NSDictionary?
        let result = script.executeAndReturnError(&errorDict)
        if let errorDict = errorDict {
            let message = errorDict[NSAppleScript.errorMessage] as? String ?? "Unknown error"
            throw SystemVolumeError.scriptFailure(message)
        }
        return result
    }
}
