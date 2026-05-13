import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';

import { useSessionStore, type Phase } from '@/stores/session';
import { usePatientStore } from '@/stores/patient';
import { useToastStore } from '@/stores/toast';

const PHASE_ROUTES: Record<string, Phase> = {
  '/phase/1': 'phase1',
  '/phase/2': 'phase2',
  '/phase/3': 'phase3',
  '/phase/4': 'phase4',
  '/quick-reference': 'quickref',
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
      path: '/clinical-note',
      name: 'clinical-note',
      component: () => import('@/views/ClinicalNoteView.vue'),
    },
    {
      path: '/ui-demo',
      name: 'ui-demo',
      component: () => import('@/views/UiDemoView.vue'),
    },
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
  const targetPhase = PHASE_ROUTES[to.path];
  if (targetPhase && GATED_PHASES.has(targetPhase) && !patient.isPhase1Complete) {
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
router.afterEach((to: RouteLocationNormalized) => {
  const session = useSessionStore();
  const phase = PHASE_ROUTES[to.path];
  if (phase) {
    session.setPhase(phase);
  }
});
