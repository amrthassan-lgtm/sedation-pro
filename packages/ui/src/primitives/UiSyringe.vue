<script setup lang="ts">
import { computed } from 'vue';

/**
 * Stylised syringe illustration. Renders an SVG of a generic IV syringe with:
 *  - a transparent barrel with millilitre tick marks
 *  - a coloured fluid fill matching the drug's brand tint
 *  - a plunger seal whose position tracks the volume drawn
 *
 * Orientation matches the legacy single-file app: needle on the left (the
 * "patient" end), thumb ring on the right (the operator end). The plunger
 * seal sits at the RIGHT edge of the fluid column, with a static rod and
 * thumb ring drawn just outside the back of the barrel. As more fluid is
 * drawn the seal advances rightward toward the back.
 *
 * The component is intentionally a single primitive instead of five drug-
 * specific assets — colour band + concentration text is the per-drug variance,
 * the syringe geometry is shared. Keeps the bundle small (one component,
 * five instantiations) and means a new drug doesn't need an artist.
 *
 * Sizing: fixed aspect ratio inside a flex parent. The wrapper element sets
 * the width; the SVG fills it.
 */

interface Props {
  /** Drug brand label rendered above the syringe (e.g. "Versed 5 mg"). */
  label: string;
  /** Concentration text under the syringe (e.g. "5 mg/mL"). */
  concentration?: string;
  /** Total syringe capacity in mL — determines the tick count. */
  capacityMl: number;
  /** Volume of drug drawn in mL — drives the fluid fill width. */
  drawnMl: number;
  /** Drug tint colour (CSS color or hex). Used for the fluid + the cap band. */
  color: string;
  /** Caption shown to the right of the syringe (e.g. "1.0 mL", "0.3 mL IM"). */
  caption?: string;
  /** Compact variant for inline use in step cards. */
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  concentration: '',
  caption: '',
  compact: false,
});

const tickCount = computed(() => Math.max(2, Math.round(props.capacityMl * 2)));
const fillFraction = computed(() => {
  if (!Number.isFinite(props.capacityMl) || props.capacityMl <= 0) return 0;
  const f = props.drawnMl / props.capacityMl;
  return Math.max(0, Math.min(1, f));
});

// Geometry — single canvas coordinates so the math is readable in the template.
// viewBox is 280×70. Needle on the left, barrel in the middle, rod+thumb on the right.
const NEEDLE_W = 30;
const HUB_W = 8;
const BARREL_X = NEEDLE_W + HUB_W; // 38
const BARREL_W = 168;
const BARREL_Y = 26;
const BARREL_H = 22;
const BARREL_RIGHT = BARREL_X + BARREL_W; // 206
const PLUNGER_HEAD_W = 8;
const THUMB_X = 256;
const THUMB_W = 12;
const THUMB_Y = 18;
const THUMB_H = 38;

const fluidW = computed(() => BARREL_W * fillFraction.value);

/**
 * Left edge of the plunger seal — sits at the RIGHT edge of the fluid column.
 * As more fluid is drawn the seal advances rightward toward the back of the
 * barrel. Clamped so a full draw doesn't visually exit the barrel.
 */
const plungerHeadX = computed(() => {
  const x = BARREL_X + fluidW.value;
  return Math.min(BARREL_RIGHT - PLUNGER_HEAD_W, Math.max(BARREL_X, x));
});

/**
 * Plunger rod stretches from the right edge of the seal out to the thumb
 * ring, passing through the empty back portion of the barrel. Width is
 * dynamic so the rod visually CONNECTS the seal to the thumb ring at every
 * fluid level — without this the seal looks orphaned next to a long stretch
 * of empty barrel.
 */
const rodX = computed(() => plungerHeadX.value + PLUNGER_HEAD_W);
const rodW = computed(() => Math.max(0, THUMB_X - rodX.value));

const ticks = computed(() => {
  const out: Array<{ x: number; label: string | null }> = [];
  const n = tickCount.value;
  for (let i = 0; i <= n; i += 1) {
    const x = BARREL_X + (BARREL_W * i) / n;
    const ml = (props.capacityMl * i) / n;
    const isMajor = i % 2 === 0;
    out.push({ x, label: isMajor ? ml.toFixed(0) : null });
  }
  return out;
});
</script>

<template>
  <figure class="syringe" :class="{ 'is-compact': props.compact }">
    <figcaption class="syringe-label">{{ props.label }}</figcaption>

    <div class="syringe-stage">
      <svg
        class="syringe-svg"
        viewBox="0 0 280 70"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="`${props.label} syringe, ${props.drawnMl} of ${props.capacityMl} millilitres drawn`"
      >
        <!-- Needle shaft -->
        <rect x="0" :y="BARREL_Y + BARREL_H / 2 - 1" :width="NEEDLE_W" height="2" fill="#cbd5e1" />
        <!-- Needle bevel tip -->
        <polygon
          :points="`0,${BARREL_Y + BARREL_H / 2 - 1} -6,${BARREL_Y + BARREL_H / 2} 0,${BARREL_Y + BARREL_H / 2 + 1}`"
          fill="#cbd5e1"
        />

        <!-- Luer hub: tapered cone from needle to barrel -->
        <polygon
          :points="`${NEEDLE_W},${BARREL_Y + 4} ${BARREL_X},${BARREL_Y} ${BARREL_X},${BARREL_Y + BARREL_H} ${NEEDLE_W},${BARREL_Y + BARREL_H - 4}`"
          :fill="props.color"
        />

        <!-- Barrel outline (drawn before fluid so fluid renders inside it) -->
        <rect
          :x="BARREL_X"
          :y="BARREL_Y"
          :width="BARREL_W"
          :height="BARREL_H"
          rx="3"
          fill="rgba(13, 21, 39, 0.6)"
          stroke="#a8b6cf"
          stroke-width="1.4"
        />

        <!-- Drug fill — sits inside the barrel from the needle end (left). -->
        <rect
          :x="BARREL_X"
          :y="BARREL_Y + 2"
          :width="fluidW"
          :height="BARREL_H - 4"
          rx="2"
          :fill="props.color"
          opacity="0.85"
        />

        <!-- Plunger seal — pressed against the right edge of the fluid. -->
        <rect
          :x="plungerHeadX"
          :y="BARREL_Y - 1"
          :width="PLUNGER_HEAD_W"
          :height="BARREL_H + 2"
          rx="1.5"
          fill="#5d6b85"
          stroke="#a8b6cf"
          stroke-width="0.8"
        />

        <!-- Plunger rod — bridges the seal to the thumb ring, passing through
             the empty back portion of the barrel and out the back. -->
        <rect
          :x="rodX"
          :y="BARREL_Y + BARREL_H / 2 - 3"
          :width="rodW"
          height="6"
          fill="#5d6b85"
          stroke="#a8b6cf"
          stroke-width="0.6"
        />

        <!-- Thumb ring at the back of the rod. -->
        <rect
          :x="THUMB_X"
          :y="THUMB_Y"
          :width="THUMB_W"
          :height="THUMB_H"
          rx="2"
          fill="#0d1527"
          stroke="#a8b6cf"
          stroke-width="1.2"
        />

        <!-- ml tick marks across the barrel -->
        <g class="ticks" stroke="#a8b6cf" stroke-width="1">
          <line
            v-for="(t, i) in ticks"
            :key="i"
            :x1="t.x"
            :x2="t.x"
            :y1="BARREL_Y"
            :y2="t.label !== null ? BARREL_Y + 6 : BARREL_Y + 4"
          />
        </g>
        <g class="tick-labels" fill="#a8b6cf" font-size="7" font-family="ui-monospace, monospace">
          <text
            v-for="(t, i) in ticks"
            :key="`l-${i}`"
            v-show="t.label !== null"
            :x="t.x"
            :y="BARREL_Y - 3"
            text-anchor="middle"
          >
            {{ t.label }}
          </text>
        </g>
      </svg>
    </div>

    <div v-if="props.caption || props.concentration" class="syringe-meta">
      <span v-if="props.caption" class="syringe-caption">{{ props.caption }}</span>
      <span v-if="props.concentration" class="syringe-conc">{{ props.concentration }}</span>
    </div>
  </figure>
</template>

<style scoped>
.syringe {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px;
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
}
.syringe.is-compact {
  padding: 8px 10px;
}
.syringe-label {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.syringe-stage {
  display: flex;
  align-items: center;
  justify-content: center;
}
.syringe-svg {
  width: 100%;
  height: auto;
  max-height: 70px;
}
.syringe-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}
.syringe-caption {
  font-family: var(--font-mono);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.syringe-conc {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
}
</style>
