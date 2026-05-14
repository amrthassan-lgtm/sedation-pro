<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from 'vue';

interface Props {
  /** Stored signature as a PNG data URL. Empty string / null means unsigned. */
  modelValue?: string | null;
  /** Pen color override — defaults to the engine's primary text color. */
  inkColor?: string;
  /** Pen stroke width in CSS px. */
  strokeWidth?: number;
  /** Aspect ratio of the canvas (width:height). 4 = 4:1, the iOS Settings shape. */
  aspectRatio?: number;
  /** Disable the pad entirely. */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  inkColor: '#ffffff',
  strokeWidth: 2.4,
  aspectRatio: 4,
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
}>();

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
const dpr = ref(1);
const hasInk = ref(false);
const drawing = ref(false);
let ctx: CanvasRenderingContext2D | null = null;
let lastX = 0;
let lastY = 0;

function ensureContext() {
  if (ctx) return ctx;
  const canvas = canvasRef.value;
  if (!canvas) return null;
  ctx = canvas.getContext('2d');
  return ctx;
}

function fitCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  dpr.value = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr.value));
  canvas.height = Math.max(1, Math.round(rect.height * dpr.value));
  const c = ensureContext();
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr.value, dpr.value);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = props.inkColor;
  c.lineWidth = props.strokeWidth;
  if (props.modelValue) {
    drawFromDataUrl(props.modelValue);
  }
}

function drawFromDataUrl(url: string) {
  const c = ensureContext();
  const canvas = canvasRef.value;
  if (!c || !canvas) return;
  const img = new Image();
  img.onload = () => {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    c.restore();
    hasInk.value = true;
  };
  img.src = url;
}

function pointerToCanvas(event: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value!;
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  drawing.value = true;
  const { x, y } = pointerToCanvas(event);
  lastX = x;
  lastY = y;
  // Single-tap dot — paint a small filled circle so a quick tap leaves a mark.
  const c = ensureContext();
  if (!c) return;
  c.fillStyle = props.inkColor;
  c.beginPath();
  c.arc(x, y, props.strokeWidth / 2, 0, Math.PI * 2);
  c.fill();
  hasInk.value = true;
}

function onPointerMove(event: PointerEvent) {
  if (!drawing.value || props.disabled) return;
  const c = ensureContext();
  if (!c) return;
  event.preventDefault();
  const { x, y } = pointerToCanvas(event);
  c.beginPath();
  c.moveTo(lastX, lastY);
  c.lineTo(x, y);
  c.stroke();
  lastX = x;
  lastY = y;
  hasInk.value = true;
}

function commit() {
  if (!hasInk.value) {
    emit('update:modelValue', null);
    return;
  }
  const canvas = canvasRef.value;
  if (!canvas) return;
  // Flatten white-ink-on-transparent over a solid black background and
  // export JPEG. Consumers apply `filter: invert(1)` at display time, which
  // flips the black background to white and the white ink to black — same
  // visual result as the previous transparent-PNG path, ~10× smaller on
  // disk so localStorage doesn't fill up after a few cases.
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const fctx = flat.getContext('2d');
  if (!fctx) {
    emit('update:modelValue', canvas.toDataURL('image/png'));
    return;
  }
  fctx.fillStyle = '#000';
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(canvas, 0, 0);
  emit('update:modelValue', flat.toDataURL('image/jpeg', 0.75));
}

function onPointerUp(event: PointerEvent) {
  if (!drawing.value) return;
  const canvas = canvasRef.value;
  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  drawing.value = false;
  commit();
}

function clear() {
  const c = ensureContext();
  const canvas = canvasRef.value;
  if (!c || !canvas) return;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.restore();
  hasInk.value = false;
  emit('update:modelValue', null);
}

watch(
  () => props.modelValue,
  (value) => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    if (!value) {
      // External clear / reset.
      const c = ensureContext();
      if (c) {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.restore();
      }
      hasInk.value = false;
    } else if (!hasInk.value) {
      // Hydrate from external value (e.g. localStorage restore on mount).
      drawFromDataUrl(value);
    }
  },
);

onMounted(() => {
  fitCanvas();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', fitCanvas);
  }
});
</script>

<template>
  <div class="ui-sig" :class="{ 'is-signed': hasInk, 'is-disabled': disabled }">
    <div class="ui-sig-frame" :style="{ aspectRatio: String(aspectRatio) }">
      <canvas
        ref="canvasRef"
        class="ui-sig-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
      <span v-if="!hasInk" class="ui-sig-hint">Sign here</span>
      <button v-if="hasInk" type="button" class="ui-sig-clear" :disabled="disabled" @click="clear">
        Clear
      </button>
    </div>
    <div class="ui-sig-meta">
      <span v-if="hasInk" class="ui-sig-status">✓ Signed</span>
      <span v-else class="ui-sig-status muted">Awaiting signature</span>
    </div>
  </div>
</template>

<style scoped>
.ui-sig {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.ui-sig-frame {
  position: relative;
  width: 100%;
  background: var(--color-surface);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--r-md);
  overflow: hidden;
  transition: border-color var(--dur-150) var(--ease-standard);
}
.ui-sig.is-signed .ui-sig-frame {
  border-style: solid;
  border-color: rgba(74, 222, 128, 0.3);
  background: var(--color-good-soft);
}
.ui-sig.is-disabled .ui-sig-frame {
  opacity: 0.5;
}
.ui-sig-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
  background: transparent;
}
.ui-sig-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.4px;
  color: var(--color-text-disabled);
  text-transform: uppercase;
  pointer-events: none;
}
.ui-sig-clear {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-border-strong);
  background: var(--color-frosted-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.ui-sig-clear:active {
  background: var(--color-card-bg);
}
.ui-sig-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ui-sig-status {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--color-good);
}
.ui-sig-status.muted {
  color: var(--color-text-disabled);
}
</style>
