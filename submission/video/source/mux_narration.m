#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

int main(void) {
    @autoreleasepool {
        NSString *project = NSFileManager.defaultManager.currentDirectoryPath;
        NSString *videoRoot = [project stringByAppendingPathComponent:@"submission/video"];
        NSURL *videoURL = [NSURL fileURLWithPath:[videoRoot stringByAppendingPathComponent:@"chathuraksharam-demo-silent.mp4"]];
        NSURL *audioURL = [NSURL fileURLWithPath:[videoRoot stringByAppendingPathComponent:@"openai-male-narration.mp3"]];
        NSURL *outputURL = [NSURL fileURLWithPath:[videoRoot stringByAppendingPathComponent:@"chathuraksharam-demo-final.mp4"]];

        [NSFileManager.defaultManager removeItemAtURL:outputURL error:nil];

        AVURLAsset *videoAsset = [AVURLAsset URLAssetWithURL:videoURL options:nil];
        AVURLAsset *audioAsset = [AVURLAsset URLAssetWithURL:audioURL options:nil];
        AVAssetTrack *sourceVideo = [videoAsset tracksWithMediaType:AVMediaTypeVideo].firstObject;
        AVAssetTrack *sourceAudio = [audioAsset tracksWithMediaType:AVMediaTypeAudio].firstObject;
        if (!sourceVideo || !sourceAudio) {
            NSLog(@"Could not load source video or narration audio.");
            return 1;
        }

        AVMutableComposition *composition = [AVMutableComposition composition];
        AVMutableCompositionTrack *videoTrack = [composition addMutableTrackWithMediaType:AVMediaTypeVideo preferredTrackID:kCMPersistentTrackID_Invalid];
        AVMutableCompositionTrack *audioTrack = [composition addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];
        NSError *error = nil;
        [videoTrack insertTimeRange:CMTimeRangeMake(kCMTimeZero, videoAsset.duration) ofTrack:sourceVideo atTime:kCMTimeZero error:&error];
        videoTrack.preferredTransform = sourceVideo.preferredTransform;
        CMTime audioDuration = CMTimeMinimum(audioAsset.duration, videoAsset.duration);
        [audioTrack insertTimeRange:CMTimeRangeMake(kCMTimeZero, audioDuration) ofTrack:sourceAudio atTime:kCMTimeZero error:&error];
        if (error) {
            NSLog(@"Could not assemble final video: %@", error.localizedDescription);
            return 1;
        }

        AVAssetExportSession *exporter = [[AVAssetExportSession alloc] initWithAsset:composition presetName:AVAssetExportPresetHighestQuality];
        exporter.outputURL = outputURL;
        exporter.outputFileType = AVFileTypeMPEG4;
        exporter.shouldOptimizeForNetworkUse = YES;

        dispatch_semaphore_t done = dispatch_semaphore_create(0);
        [exporter exportAsynchronouslyWithCompletionHandler:^{ dispatch_semaphore_signal(done); }];
        dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
        if (exporter.status != AVAssetExportSessionStatusCompleted) {
            NSLog(@"Export failed: %@", exporter.error.localizedDescription);
            return 1;
        }

        NSLog(@"Wrote %@", outputURL.path);
    }
    return 0;
}
