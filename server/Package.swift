// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "AppleMusicRemoteServer",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .executable(
            name: "AppleMusicRemoteServer",
            targets: ["AppleMusicRemoteServer"]
        )
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "AppleMusicRemoteServer",
            dependencies: [],
            path: "Sources",
            resources: [
                .copy("Public")
            ]
        )
    ]
)
