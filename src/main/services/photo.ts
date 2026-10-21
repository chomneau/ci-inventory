import { nativeImage } from 'electron'
import { AppError } from '../ipc/errors'

const MAX_INPUT_BYTES = 15 * 1024 * 1024

/**
 * Decodes a user-chosen image with Chromium's decoder and re-encodes it as a
 * fresh JPEG. Re-encoding drops EXIF/GPS metadata and anything that is not
 * pixel data, so the stored photo can never carry a crafted payload.
 */
export function processPhoto(input: Buffer): { image: Buffer; thumbnail: Buffer } {
  if (input.length === 0 || input.length > MAX_INPUT_BYTES) throw new AppError('INVALID_IMAGE')
  const img = nativeImage.createFromBuffer(input)
  if (img.isEmpty()) throw new AppError('INVALID_IMAGE')
  return {
    image: fit(img, 800).toJPEG(82),
    thumbnail: fit(img, 160).toJPEG(78)
  }
}

function fit(img: Electron.NativeImage, max: number): Electron.NativeImage {
  const { width, height } = img.getSize()
  if (width <= max && height <= max) return img
  return width >= height ? img.resize({ width: max, quality: 'good' }) : img.resize({ height: max, quality: 'good' })
}
