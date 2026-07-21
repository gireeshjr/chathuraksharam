import AppKit
import AVFoundation
import CoreVideo
import Foundation

let width = 1280
let height = 720
let frameRate: Int32 = 30
let project = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let videoRoot = project.appendingPathComponent("submission/video")
let framesRoot = videoRoot.appendingPathComponent("frames")
let silentURL = videoRoot.appendingPathComponent("chathuraksharam-demo-silent.mp4")
let audioURL = videoRoot.appendingPathComponent("openai-male-narration.mp3")
let finalURL = videoRoot.appendingPathComponent("chathuraksharam-demo-final.mp4")

enum Segment {
    case still(String, Double)
    case sequence(String, Double)
}

let timeline: [Segment] = [
    .still("00-title.png", 7.0),
    .still("01-opening.png", 10.0),
    .sequence("02-spin-", 0.10),
    .still("03-after-pull.png", 10.0),
    .still("04-picker.png", 12.0),
    .still("05-menu.png", 10.0),
    .still("06-malayalam.png", 10.0),
    .sequence("07-ml-spin-", 0.10),
    .still("08-malayalam-after.png", 10.0),
    .still("09-spanish-arts.png", 10.0),
    .still("10-word-ready.png", 8.0),
    .sequence("11-win-", 0.10),
    .still("12-win-final.png", 10.0),
    .still("13-architecture.png", 18.0),
    .still("14-codex.png", 18.0),
    .still("15-closing.png", 10.0),
]

func removeIfPresent(_ url: URL) {
    if FileManager.default.fileExists(atPath: url.path) {
        try? FileManager.default.removeItem(at: url)
    }
}

func pixelBuffer(for imageURL: URL) throws -> CVPixelBuffer {
    guard let image = NSImage(contentsOf: imageURL) else {
        throw NSError(domain: "DemoVideo", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot load \(imageURL.path)"])
    }
    var rect = NSRect(x: 0, y: 0, width: width, height: height)
    guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        throw NSError(domain: "DemoVideo", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot decode \(imageURL.path)"])
    }
    var buffer: CVPixelBuffer?
    let attributes: [CFString: Any] = [
        kCVPixelBufferCGImageCompatibilityKey: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey: true,
    ]
    let status = CVPixelBufferCreate(
        kCFAllocatorDefault,
        width,
        height,
        kCVPixelFormatType_32ARGB,
        attributes as CFDictionary,
        &buffer
    )
    guard status == kCVReturnSuccess, let buffer else {
        throw NSError(domain: "DemoVideo", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot allocate video frame"])
    }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let context = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else {
        throw NSError(domain: "DemoVideo", code: 4, userInfo: [NSLocalizedDescriptionKey: "Cannot create frame context"])
    }
    context.setFillColor(NSColor.black.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    return buffer
}

func sequenceFiles(prefix: String) -> [URL] {
    let files = (try? FileManager.default.contentsOfDirectory(
        at: framesRoot,
        includingPropertiesForKeys: nil
    )) ?? []
    return files.filter { $0.lastPathComponent.hasPrefix(prefix) }.sorted { $0.lastPathComponent < $1.lastPathComponent }
}

removeIfPresent(silentURL)
removeIfPresent(finalURL)

let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mp4)
let input = AVAssetWriterInput(
    mediaType: .video,
    outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 4_500_000,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ],
    ]
)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
    ]
)
guard writer.canAdd(input) else {
    fatalError("Cannot add video input")
}
writer.add(input)
guard writer.startWriting() else {
    fatalError("Cannot start video writer: \(writer.error?.localizedDescription ?? "unknown error")")
}
writer.startSession(atSourceTime: .zero)

var frameIndex: Int64 = 0

func append(_ file: URL, copies: Int) throws {
    let buffer = try pixelBuffer(for: file)
    for _ in 0..<copies {
        while !input.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.002)
        }
        let time = CMTime(value: frameIndex, timescale: frameRate)
        guard adaptor.append(buffer, withPresentationTime: time) else {
            throw writer.error ?? NSError(domain: "DemoVideo", code: 5, userInfo: [NSLocalizedDescriptionKey: "Cannot append frame"])
        }
        frameIndex += 1
    }
}

for segment in timeline {
    switch segment {
    case let .still(name, duration):
        try append(framesRoot.appendingPathComponent(name), copies: Int((duration * Double(frameRate)).rounded()))
    case let .sequence(prefix, frameDuration):
        let copies = max(1, Int((frameDuration * Double(frameRate)).rounded()))
        for file in sequenceFiles(prefix: prefix) {
            try append(file, copies: copies)
        }
    }
}

input.markAsFinished()
let finishSemaphore = DispatchSemaphore(value: 0)
writer.finishWriting {
    finishSemaphore.signal()
}
finishSemaphore.wait()
guard writer.status == .completed else {
    fatalError("Video writer failed: \(writer.error?.localizedDescription ?? "unknown error")")
}

let composition = AVMutableComposition()
let videoAsset = AVURLAsset(url: silentURL)
let audioAsset = AVURLAsset(url: audioURL)
guard
    let sourceVideo = videoAsset.tracks(withMediaType: .video).first,
    let compositionVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
else {
    fatalError("Cannot load rendered video")
}
try compositionVideo.insertTimeRange(
    CMTimeRange(start: .zero, duration: videoAsset.duration),
    of: sourceVideo,
    at: .zero
)
compositionVideo.preferredTransform = sourceVideo.preferredTransform

if let sourceAudio = audioAsset.tracks(withMediaType: .audio).first,
   let compositionAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
    let audioDuration = CMTimeMinimum(audioAsset.duration, videoAsset.duration)
    try compositionAudio.insertTimeRange(
        CMTimeRange(start: .zero, duration: audioDuration),
        of: sourceAudio,
        at: .zero
    )
}

guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    fatalError("Cannot create video exporter")
}
exporter.outputURL = finalURL
exporter.outputFileType = .mp4
exporter.shouldOptimizeForNetworkUse = true
let exportSemaphore = DispatchSemaphore(value: 0)
exporter.exportAsynchronously {
    exportSemaphore.signal()
}
exportSemaphore.wait()
guard exporter.status == .completed else {
    fatalError("Video export failed: \(exporter.error?.localizedDescription ?? "unknown error")")
}

let seconds = Double(frameIndex) / Double(frameRate)
print(String(format: "Rendered %.1f seconds to %@", seconds, finalURL.path))
