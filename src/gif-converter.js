import { Muxer, ArrayBufferTarget } from 'webm-muxer';

export async function convertGifToWebm(file, progressCallback) {
  if (!window.ImageDecoder || !window.VideoEncoder) {
    // Fallback: unsupported browser (Safari/Firefox). Just hope it plays in <video>.
    return URL.createObjectURL(file);
  }

  const arrayBuffer = await file.arrayBuffer();
  const decoder = new ImageDecoder({ type: 'image/gif', data: arrayBuffer });
  
  await decoder.tracks.ready;
  if (!decoder.tracks.selectedTrack) {
    throw new Error("No video track in GIF");
  }

  // To find width/height, decode the first frame
  const firstFrame = await decoder.decode({ frameIndex: 0 });
  const width = firstFrame.image.codedWidth;
  const height = firstFrame.image.codedHeight;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'V_VP9',
      width: width,
      height: height
    }
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: (e) => console.error("GIF Encoder Error:", e)
  });

  videoEncoder.configure({
    codec: 'vp09.00.10.08',
    width: width,
    height: height,
    bitrate: 5_000_000,
    framerate: 30
  });

  let timestamp = 0;
  let i = 0;

  while (true) {
    try {
      const result = await decoder.decode({ frameIndex: i });
      // duration in ms. Multiply by 1000 for microseconds
      const durationUs = (result.image.duration !== null && result.image.duration > 0) ? result.image.duration : 100000;
      
      const frame = new VideoFrame(result.image, { timestamp, duration: durationUs });
      videoEncoder.encode(frame);
      frame.close();
      
      timestamp += durationUs;
      i++;

      if (progressCallback && i % 10 === 0) {
        progressCallback(`Converting GIF... ${i} frames`);
      }
    } catch (e) {
      if (e instanceof RangeError) {
        // We reached the end of the GIF
        break;
      } else {
        throw e;
      }
    }
  }

  await videoEncoder.flush();
  muxer.finalize();

  const blob = new Blob([muxer.target.buffer], { type: 'video/webm' });
  return URL.createObjectURL(blob);
}
