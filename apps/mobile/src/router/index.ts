import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';

import { useSessionStore, type Phase } from '@/stores/session';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { useToastStore } from '@/stores/toast';

const PHASE_ROUTES: Record<string, Phase> = {
  '/phase/1': 'phase1',
  '/phase/2': 'phase2',
  '/phase/3': 'phase3',
  '/phase/4': 'phase4',
  '/quick-reference': 'quickref',
  '/inventory': 'inventory',
};

const GATED_PHASES: ReadonlySet<Phase> = new Set(['phase2', 'phase3', 'phase4']);

export const router = createRouter({
  // `import.meta.env.BASE_URL` is set by Vite's `base` config — '/' in dev,
  // '/sedation-pro/' on GitHub Pages. Letting the router know keeps deep
  // links and redirects honest under both hosts.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/phase/1' },
    {
      path: '/phase/1',
      name: 'phase1',
      component: () => import('@/views/Phase1View.vue'),
    },
    {
      path: '/phase/2',
      name: 'phase2',
      component: () => import('@/views/Phase2View.vue'),
    },
    {
      path: '/phase/3',
      name: 'phase3',
      component: () => import('@/views/Phase3View.vue'),
    },
    {
      path: '/phase/4',
      name: 'phase4',
      component: () => import('@/views/Phase4View.vue'),
    },
    {
      path: '/quick-reference',
      name: 'quickref',
      component: () => import('@/views/QuickReferenceView.vue'),
    },
    {
      path: '/quick-reference/:id',
      name: 'quickref-detail',
      component: () => import('@/views/QuickReferenceDetailView.vue'),
      props: true,
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/InventoryView.vue'),
    },
    {
      path: '/clinical-note',
      name: 'clinical-note',
      component: () => import('@/views/ClinicalNoteView.vue'),
    },
    // Practice-level setup, deliberately NOT gated behind Phase 1 — the keys
    // get entered on a quiet afternoon, not with a patient in the chair.
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    // UiDemoView is the developer-only primitives gallery — ships only in
    // `pnpm dev`. Excluded from production / store builds so a deep link can't
    // land a clinician on the demo screen.
    ...(import.meta.env.DEV
      ? [
          {
            path: '/ui-demo',
            name: 'ui-demo',
            component: () => import('@/views/UiDemoView.vue'),
          },
        ]
      : []),
    { path: '/:pathMatch(.*)*', redirect: '/phase/1' },
  ],
});

/**
 * Phase 2/3/4 are locked until Phase 1 completes. The router guard rewrites
 * blocked navigations back to `/phase/1` so a deep-link or a stale nav-drawer
 * tap can never bypass the gate. The nav drawer disables those rows in
 * parallel — both surfaces read the same `usePatientStore.isPhase1Complete`,
 * so they can't disagree.
 */
router.beforeEach((to: RouteLocationNormalized) => {
  const patient = usePatientStore();

  /**
   * An unsigned note is not a record, so it must not be reachable — not by
   * deep link, not by a stale back button, not by a restored session. The
   * button in Phase 4 is disabled in parallel; both surfaces read the same
   * `providerSignatureDataUrl`, so they can't disagree.
   *
   * Deliberately independent of encounter kind. Phase 4 is reachable
   * whenever Phase 1 is complete, so an assessment-only case (sedation
   * deferred) can still be signed and still produce its note — the signature
   * is exactly what `canConclude` already requires there. Gating on
   * "was sedation given" instead would trap half of this practice's notes.
   */
  if (to.path === '/clinical-note') {
    const recovery = useRecoveryStore();
    if (recovery.providerSignatureDataUrl === null) {
      // Mirrors the Phase 1 gate: flip the attempted flag so Phase 4 paints
      // the red ring on the signature field rather than bouncing silently.
      recovery.releaseAttempted = true;
      const toast = useToastStore();
      toast.show(
        {
          id: `gate-signature-${Date.now()}`,
          label: 'Signature required',
          sub: 'Sign in Phase 4 to generate the note',
          tone: 'caution',
        },
        6000,
      );
      return { path: '/phase/4' };
    }
  }

  const targetPhase = PHASE_ROUTES[to.path];
  if (targetPhase && GATED_PHASES.has(targetPhase) && !patient.isPhase1Complete) {
    // Flip the validation flag so Phase 1 paints red rings on every missing
    // required field — the user gets a concrete visual answer to "which ones?"
    // in addition to the toast below.
    patient.markValidationAttempted();
    // Surface a toast so the redirect isn't silent. The user sees a clear
    // "Phase 1 not complete yet" explanation rather than wondering why the
    // tap appeared to do nothing.
    const toast = useToastStore();
    const missing = patient.completeness.missing;
    const missingLabels =
      missing.length === 0
        ? ''
        : missing
            .slice(0, 3)
            .map((m) => m.label)
            .join(', ') + (missing.length > 3 ? `, +${missing.length - 3} more` : '');
    toast.show(
      {
        id: `gate-${Date.now()}`,
        label: 'Complete Phase 1 first',
        sub: missingLabels || 'Fill required fields to unlock',
        tone: 'caution',
      },
      6000,
    );
    return { path: '/phase/1' };
  }
  return true;
});

/**
 * Whenever the router lands on a known phase, mirror it into the session
 * store so the sticky bar and nav drawer pick it up. We don't push from the
 * store side here — components that need to navigate call `router.push()`
 * and the watcher below catches it.
 */
function resolvePhase(path: string): Phase | undefined {
  if (PHASE_ROUTES[path]) return PHASE_ROUTES[path];
  // Detail routes under /quick-reference/:id still belong to the quickref tint.
  if (path.startsWith('/quick-reference')) return 'quickref';
  return undefined;
}

router.afterEach((to: RouteLocationNormalized) => {
  const session = useSessionStore();
  const phase = resolvePhase(to.path);
  if (phase) {
    session.setPhase(phase);
  }
});
