import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import { router } from './router';

import '@sedation-pro/ui/styles';
import './styles/utilities.css';
// Side-effect: resolves and applies the theme before first paint.
import './composables/useTheme';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
