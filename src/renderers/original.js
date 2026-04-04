export const OriginalRenderer = {
  render(params) {
    const { gl, ctx, videoSource, viewportWidth, viewportHeight } = params;

    if (gl) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (ctx) {
      const sourceW = videoSource.videoWidth || videoSource.width;
      const sourceH = videoSource.videoHeight || videoSource.height;
      const aspectRatio = sourceW / sourceH;

      const scaledHeight = viewportHeight;
      const scaledWidth = Math.round(scaledHeight * aspectRatio);
      const x = Math.round((viewportWidth - scaledWidth) / 2);

      ctx.drawImage(videoSource, x, 0, scaledWidth, scaledHeight);
    }
  }
};
