<script setup lang="ts">
import { computed } from 'vue';

/**
 * Stylised syringe illustration. Renders an SVG of a generic IV syringe with:
 *  - a transparent barrel with millilitre tick marks
 *  - a coloured fluid fill matching the drug's brand tint
 *  - a plunger positioned so the *empty* portion equals the dose drawn
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
const BARREL_X = 18;
const BARREL_W = 200;
const BARREL_Y = 26;
const BARREL_H = 22;
const PLUNGER_HEAD_W = 6;

const fluidW = computed(() => BARREL_W * fillFraction.value);

/**
 * Left edge of the plunger head — sits immediately behind the fluid column.
 * As more fluid is drawn the plunger retreats LEFT, away from the needle.
 * Clamped at the barrel's back so a full draw doesn't overlap the flange.
 */
const plungerHeadLeftX = computed(() => {
  const x = BARREL_X + BARREL_W - fluidW.value - PLUNGER_HEAD_W;
  return Math.max(BARREL_X, x);
});

/** Visible rod length — fills the empty barrel space between flange and plunger. */
const rodW = computed(() => Math.max(0, plungerHeadLeftX.value - (BARREL_X - 4)));

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
        <!-- Flange (back of the syringe) -->
        <rect
          x="2"
          y="22"
          width="14"
          height="30"
          rx="2"
          fill="#0d1527"
          stroke="#8a9bb8"
          stroke-width="1.2"
        />

        <!-- Barrel outline -->
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

        <!-- Drug fill — sits inside the barrel from the cap end. -->
        <rect
          :x="BARREL_X + BARREL_W - fluidW"
          :y="BARREL_Y + 2"
          :width="fluidW"
          :height="BARREL_H - 4"
          rx="2"
          :fill="props.color"
          opacity="0.85"
        />

        <!-- Plunger rod fills the empty barrel space behind the plunger head. -->
        <rect
          :x="BARREL_X - 4"
          y="32"
          :width="rodW"
          height="10"
          fill="#5d6b85"
          stroke="#a8b6cf"
          stroke-width="1"
        />

        <!-- Plunger head pressed against the back (left edge) of the fluid column. -->
        <rect
          :x="plungerHeadLeftX"
          :y="BARREL_Y + 2"
          :width="PLUNGER_HEAD_W"
          :height="BARREL_H - 4"
          rx="1"
          fill="#cbd5e1"
          stroke="#5d6b85"
          stroke-width="0.6"
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

        <!-- Hub + needle -->
        <path
          :d="`M ${BARREL_X + BARREL_W} ${BARREL_Y + 4} L ${BARREL_X + BARREL_W + 8} ${BARREL_Y + 8} L ${BARREL_X + BARREL_W + 8} ${BARREL_Y + BARREL_H - 8} L ${BARREL_X + BARREL_W} ${BARREL_Y + BARREL_H - 4} Z`"
          :fill="props.color"
        />
        <rect
          :x="BARREL_X + BARREL_W + 8"
          :y="BARREL_Y + 10"
          width="44"
          height="2"
          fill="#cbd5e1"
        />
        <!-- needle bevel -->
        <polygon
          :points="`${BARREL_X + BARREL_W + 52},${BARREL_Y + 10} ${BARREL_X + BARREL_W + 60},${BARREL_Y + 11} ${BARREL_X + BARREL_W + 52},${BARREL_Y + 12}`"
          fill="#cbd5e1"
        />
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
