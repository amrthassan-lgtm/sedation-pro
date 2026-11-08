import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';

import { CASE_PHASE_ROUTE, useSessionStore, type Phase } from '@/stores/session';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { useToastStore } from '@/stores/toast';

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * The shell identity of this screen: the sticky-bar label, the drawer
     * highlight, the Phase 1 gate and scroll restore all read it. Declared
     * once per route, so a new route cannot be half-registered. A route
     * without one (redirects, the dev gallery) leaves the bar as it was.
     */
    phase?: Phase;
  }
}

const GATED_PHASES: ReadonlySet<Phase> = new Set(['phase2', 'phase3', 'phase4']);

export const router = createRouter({
  // `import.meta.env.BASE_URL` is set by Vite's `base` config — '/' in dev,
  // '/sedation-pro/' on GitHub Pages. Letting the router know keeps deep
  // links and redirects honest under both hosts.
  history: createWebHistory(import.meta.env.BASE_URL),
  // Browser back/forward restore their own position. Returning to a case
  // phase by any other route (the Back to case button, the drawer) lands at
  // the scroll position captured when the clinician left it. Everything
  // else starts at the top. The restore waits a frame for the phase view to
  // render at full height.
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    const phase = to.meta.phase;
    const session = useSessionStore();
    const top = phase ? session.caseScroll[phase as keyof typeof session.caseScroll] : undefined;
    if (top === undefined) return { top: 0 };
    return new Promise((resolve) => {
      setTimeout(() => resolve({ top }), 60);
    });
  },
  routes: [
    { path: '/', redirect: '/phase/1' },
    {
      path: CASE_PHASE_ROUTE.phase1,
      name: 'phase1',
      meta: { phase: 'phase1' },
      component: () => import('@/views/Phase1View.vue'),
    },
    {
      path: CASE_PHASE_ROUTE.phase2,
      name: 'phase2',
      meta: { phase: 'phase2' },
      component: () => import('@/views/Phase2View.vue'),
    },
    {
      path: CASE_PHASE_ROUTE.phase3,
      name: 'phase3',
      meta: { phase: 'phase3' },
      component: () => import('@/views/Phase3View.vue'),
    },
    {
      path: CASE_PHASE_ROUTE.phase4,
      name: 'phase4',
      meta: { phase: 'phase4' },
      component: () => import('@/views/Phase4View.vue'),
    },
    {
      path: '/quick-reference',
      name: 'quickref',
      meta: { phase: 'quickref' },
      component: () => import('@/views/QuickReferenceView.vue'),
    },
    {
      path: '/quick-reference/:id',
      name: 'quickref-detail',
      meta: { phase: 'quickref' },
      component: () => import('@/views/QuickReferenceDetailView.vue'),
      props: true,
    },
    {
      path: '/inventory',
      name: 'inventory',
      meta: { phase: 'inventory' },
      component: () => import('@/views/InventoryView.vue'),
    },
    // Saved notes are records of FINISHED encounters, so they are not gated
    // on the current case's signature — the note being viewed carries its
    // own, from the day it was signed.
    {
      path: '/notes',
      name: 'saved-notes',
      meta: { phase: 'notes' },
      component: () => import('@/views/SavedNotesView.vue'),
    },
    {
      path: '/notes/:id',
      name: 'saved-note',
      meta: { phase: 'notes' },
      component: () => import('@/views/ClinicalNoteView.vue'),
      props: true,
    },
    {
      path: '/clinical-note',
      name: 'clinical-note',
      meta: { phase: 'note' },
      component: () => import('@/views/ClinicalNoteView.vue'),
    },
    // Practice-level setup, deliberately NOT gated behind Phase 1 — the keys
    // get entered on a quiet afternoon, not with a patient in the chair.
    {
      path: '/settings',
      name: 'settings',
      meta: { phase: 'settings' },
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
router.beforeEach((to: RouteLocationNormalized, from: RouteLocationNormalized) => {
  const patient = usePatientStore();

  const leaving = from.meta.phase;
  if (leaving && typeof window !== 'undefined') {
    useSessionStore().rememberScroll(leaving, window.scrollY);
  }

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

  const targetPhase = to.meta.phase;
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
 * Whenever the router lands on a screen with a shell identity, mirror it
 * into the session store so the sticky bar and nav drawer pick it up.
 * Components that need to navigate call `router.push()`; this hook catches it.
 */
router.afterEach((to: RouteLocationNormalized) => {
  const phase = to.meta.phase;
  if (phase) useSessionStore().setPhase(phase);
});
