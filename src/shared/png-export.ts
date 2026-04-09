/**
 * Trigger a download of a canvas as a PNG file. Used by D2 Manga Shrinkwrap
 * and Bijuu Mode Typography for the export buttons.
 *
 * Respects DPR — the canvas backing store is already at the correct
 * resolution if it was set up via setupCanvas() in shared/canvas.ts.
 */
export function exportCanvasAsPng(
  canvas: HTMLCanvasElement,
  filename: string,
): void {
  canvas.toBlob((blob) => {
    if (!blob) {
      console.error('exportCanvasAsPng: canvas.toBlob returned null')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoke after a tick so the download has time to start
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }, 'image/png')
}
