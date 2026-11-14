import { createRouter, createWebHashHistory } from 'vue-router';

import BriefView from './views/BriefView.vue';
import DebriefView from './views/DebriefView.vue';
import HomeView from './views/HomeView.vue';
import RoomView from './views/RoomView.vue';

/**
 * Hash routing on purpose. The trainer is served from a folder inside the
 * clinical app's GitHub Pages site, whose 404 fallback is the clinical app's
 * own shell: a path-based deep link here would load the wrong app. A hash
 * never reaches the server.
 *
 * The views are imported whole, not split into chunks loaded on demand. The
 * trainer has no service worker, so a deploy that lands while a drill is
 * running would remove the chunk the next screen needs: the run would end
 * and the debrief would never open.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/brief/:id', name: 'brief', component: BriefView, props: true },
    { path: '/room/:id', name: 'room', component: RoomView, props: true },
    { path: '/debrief', name: 'debrief', component: DebriefView },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
