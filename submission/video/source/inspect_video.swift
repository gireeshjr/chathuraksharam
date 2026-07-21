import AppKit
import AVFoundation
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let video = root.appendingPathComponent("submission/video/chathuraksharam-demo-draft.mp4")
let output = root.appendingPathComponent("submission/video/qa")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let asset = AVURLAsset(url: video)
guard let track = asset.tracks(withMediaType: .video).first else {
    fatalError("The draft has no video track")
}
let audioTracks = asset.tracks(withMediaType: .audio)
let size = track.naturalSize.applying(track.preferredTransform)
let duration = CMTimeGetSeconds(asset.duration)
print("duration=\(String(format: "%.2f", duration))")
print("video=\(Int(abs(size.width)))x\(Int(abs(size.height)))")
print("audioTracks=\(audioTracks.count)")
print("transform=\(track.preferredTransform)")

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

for second in [0.5, 18.0, 46.0, 69.0, 89.0, 116.0, 137.0, 148.0] {
    let time = CMTime(seconds: second, preferredTimescale: 600)
    let image = try generator.copyCGImage(at: time, actualTime: nil)
    let bitmap = NSBitmapImageRep(cgImage: image)
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Cannot encode QA frame")
    }
    let name = String(format: "qa-%05.1f.png", second)
    try data.write(to: output.appendingPathComponent(name))
}
