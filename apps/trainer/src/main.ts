import { createApp } from 'vue';

import App from './App.vue';
import { router } from './router';

import '@sedation-pro/ui/styles';
import './styles/trainer.css';

createApp(App).use(router).mount('#app');
