function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportScreenshot(sourceCanvas, metadata) {
  const width = Math.max(sourceCanvas.width, sourceCanvas.clientWidth, 960);
  const sourceHeight = Math.max(sourceCanvas.height, sourceCanvas.clientHeight, 540);
  const watermarkHeight = 72;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = sourceHeight + watermarkHeight;
  const context = canvas.getContext('2d');
  context.fillStyle = '#d9e7eb';
  context.fillRect(0, 0, width, sourceHeight);
  try {
    context.drawImage(sourceCanvas, 0, 0, width, sourceHeight);
  } catch {
    // A blank scene still exports with a useful project watermark.
  }
  context.fillStyle = '#17212b';
  context.fillRect(0, sourceHeight, width, watermarkHeight);
  context.fillStyle = '#f8f5ed';
  context.font = '600 18px sans-serif';
  context.fillText(
    `${metadata.city} · ${metadata.date} · ${metadata.time}`,
    24,
    sourceHeight + 30
  );
  context.fillStyle = '#b9c0c4';
  context.font = '13px sans-serif';
  context.fillText(
    '购房参考，不能替代专业日照合规报告',
    24,
    sourceHeight + 54
  );
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('浏览器无法生成截图');
  downloadBlob(blob, `sunlight-${metadata.date}-${metadata.time.replace(':', '')}.png`);
}
