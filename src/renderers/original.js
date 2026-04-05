export const OriginalRenderer = {
  render(params) {
    const { gl, videoSource, viewportWidth, viewportHeight, gridCols, gridRows, charW, charH, silhouetteOffsetX, videoTexture, uniforms } = params;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoSource);
    
    gl.uniform2f(uniforms.resolution, viewportWidth, viewportHeight);
    gl.uniform2f(uniforms.cellSize, charW, charH);
    gl.uniform2f(uniforms.gridSize, gridCols, gridRows);
    gl.uniform2f(uniforms.silOffset, silhouetteOffsetX, 0);
    gl.uniform1i(uniforms.styleId, 1);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
};
