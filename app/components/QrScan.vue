<script setup lang="ts">
import type { DroppedFile } from '~/components/FileDrop.vue'
import { loadJsQr } from '~/utils/lazy'

// QR input: camera (native BarcodeDetector when available, jsQR otherwise) or an uploaded image (jsQR).
// Frames and images are processed in the browser only.
const emit = defineEmits<{ result: [text: string] }>()

interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (o: { formats: string[] }) => Detector

const video = ref<HTMLVideoElement>()
const scanning = ref(false)
const error = ref('')
let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const canvas = import.meta.client ? document.createElement('canvas') : null

async function readCanvas(src: CanvasImageSource, w: number, h: number): Promise<string | null> {
  const jsQR = await loadJsQr()
  canvas!.width = w
  canvas!.height = h
  const ctx = canvas!.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, w, h)
  return jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null
}

async function fromFile(f: DroppedFile) {
  error.value = ''
  try {
    const bmp = await createImageBitmap(new Blob([f.bytes as BlobPart], { type: f.type || 'image/png' }))
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const text = await readCanvas(bmp, Math.round(bmp.width * scale), Math.round(bmp.height * scale))
    if (text) emit('result', text)
    else error.value = 'No QR code found in this image. Try a sharper or closer picture.'
  }
  catch {
    error.value = 'Could not read this file as an image.'
  }
}

function stop() {
  clearTimeout(timer)
  stream?.getTracks().forEach(t => t.stop())
  stream = null
  scanning.value = false
}

async function start() {
  error.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'This browser cannot open the camera here. Upload a photo or screenshot of the QR instead.'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
  }
  catch (e) {
    error.value = (e as Error).name === 'NotAllowedError' ? 'Camera access was denied. Allow it in the browser, or upload an image instead.' : 'No camera available. Upload an image instead.'
    return
  }
  scanning.value = true
  await nextTick()
  const v = video.value!
  v.srcObject = stream
  await v.play().catch(() => {})
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  let detector: Detector | null = null
  try {
    detector = Ctor ? new Ctor({ formats: ['qr_code'] }) : null
  }
  catch { /* unsupported format: jsQR */ }

  const tick = async () => {
    if (!scanning.value) return
    try {
      let text: string | null = null
      if (v.videoWidth) {
        if (detector) text = (await detector.detect(v))[0]?.rawValue ?? null
        else text = await readCanvas(v, Math.min(v.videoWidth, 960), Math.round(v.videoHeight * Math.min(1, 960 / v.videoWidth)))
      }
      if (text) {
        stop()
        emit('result', text)
        return
      }
    }
    catch { /* keep scanning */ }
    timer = setTimeout(tick, 250)
  }
  void tick()
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-2">
      <UButton v-if="!scanning" label="Scan with camera" icon="i-lucide-camera" variant="outline" data-testid="scan-camera" @click="start" />
      <UButton v-else label="Stop camera" icon="i-lucide-x" color="neutral" variant="outline" @click="stop" />
    </div>
    <video v-show="scanning" ref="video" class="aspect-square w-full max-w-sm rounded-lg bg-black object-cover" muted playsinline />
    <FileDrop accept="image/*" label="Or drop a QR image / screenshot here" @file="fromFile" />
    <p v-if="error" class="text-sm text-error" role="alert">
      {{ error }}
    </p>
  </div>
</template>
