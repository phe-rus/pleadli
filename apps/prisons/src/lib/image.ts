const DEFAULT_MAX_SIDE = 960
const DEFAULT_QUALITY = 0.85

function drawScaled(source: CanvasImageSource, width: number, height: number, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not process the image.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Reads a picked image file and returns it downscaled as a JPEG data URL, so
 * a phone photo of several megabytes never travels through the API whole. */
export async function fileToDataUrl(file: File, maxSide = DEFAULT_MAX_SIDE, quality = DEFAULT_QUALITY): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('That image could not be read.'))
      element.src = url
    })
    return drawScaled(image, image.naturalWidth, image.naturalHeight, maxSide, quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** The current frame of a playing camera stream as a downscaled JPEG data URL. */
export function videoFrameToDataUrl(video: HTMLVideoElement, maxSide = DEFAULT_MAX_SIDE, quality = DEFAULT_QUALITY): string {
  if (!video.videoWidth || !video.videoHeight) throw new Error('The camera is not ready yet.')
  return drawScaled(video, video.videoWidth, video.videoHeight, maxSide, quality)
}
