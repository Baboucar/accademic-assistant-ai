// web/src/router.js
import { createRouter, createWebHistory } from 'vue-router';

import ChatPanel from './components/ChatPanel.vue';
import AdminPanel from './components/AdminPanel.vue';

const routes = [
  { path: '/', component: ChatPanel, name: 'chat' },
  { path: '/admin', component: AdminPanel, name: 'admin' },
  // catch-all -> redirect to chat
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
