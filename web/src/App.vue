<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

// Theme handling: light/dark with persistence and system default
const theme = ref('system'); // 'light' | 'dark' | 'system'
const isDark = ref(false);
let mediaQuery; // MediaQueryList for system theme tracking
let mediaListener; // listener reference for cleanup

function applyTheme(value) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (value === 'light' || value === 'dark') {
    root.setAttribute('data-theme', value);
  }
}

function loadTheme() {
  const saved = localStorage.getItem('theme') || 'system';
  theme.value = saved;
  applyTheme(saved);
  updateIsDark();
  ensureSystemListener();
}

function toggleTheme() {
  // simple toggle between light and dark (ignoring system for toggle action)
  const next = isDark.value ? 'light' : 'dark';
  theme.value = next;
  localStorage.setItem('theme', next);
  applyTheme(next);
  updateIsDark();
  ensureSystemListener();
}

onMounted(loadTheme);

watch(theme, (val) => {
  // if user picks system in future UI, honor it
  if (val === 'system') {
    localStorage.setItem('theme', 'system');
    applyTheme('system');
  } else {
    localStorage.setItem('theme', val);
    applyTheme(val);
  }
  updateIsDark();
  ensureSystemListener();
});

function updateIsDark() {
  if (theme.value === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch (e) {
        isDark.value = false;
      }
    } else {
      isDark.value = false;
    }
  } else {
    isDark.value = theme.value === 'dark';
  }
}

function ensureSystemListener() {
  // Clean previous listener
  if (mediaQuery && mediaListener) {
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaListener);
    } else if (typeof mediaQuery.removeListener === 'function') {
      mediaQuery.removeListener(mediaListener);
    }
    mediaListener = null;
    mediaQuery = null;
  }
  // If in system mode, attach a listener to keep isDark reactive
  if (theme.value === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = (e) => { isDark.value = e.matches; };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', mediaListener);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(mediaListener);
    }
  }
}

onUnmounted(() => {
  if (mediaQuery && mediaListener) {
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', mediaListener);
    } else if (typeof mediaQuery.removeListener === 'function') {
      mediaQuery.removeListener(mediaListener);
    }
  }
});

const route = useRoute();
</script>

<template>
  <div class="app-root">
    <div class="app-shell">
      <header class="app-header">
        <div class="header-row">
          <div>
            <h1 class="app-header-title">UTG Academic Assistant</h1>
            <p class="app-header-subtitle">
              Ask about timetables, courses, lecturers, and schedules.
            </p>
          </div>
          <div class="header-actions">
            <button class="theme-toggle" @click="toggleTheme" :title="`Switch to ${isDark ? 'light' : 'dark'} mode`">
              <span v-if="isDark">Light Mode</span>
              <span v-else>Dark Mode</span>
            </button>
            <!-- Keep Admin available but subtle; moved out of main tabs -->
            <RouterLink class="admin-link" to="/admin">Admin</RouterLink>
          </div>
        </div>
        <nav class="tabs">
          <RouterLink :class="{active: route.name==='chat'}" to="/">Chat</RouterLink>
        </nav>
      </header>

      <main class="chat-root">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.header-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.header-actions { display: flex; align-items: center; gap: .5rem; }
.theme-toggle { padding: .4rem .8rem; border-radius: 999px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-main); cursor: pointer; }
.admin-link { font-size: .85rem; padding: .35rem .6rem; border: 1px solid var(--border-subtle); border-radius: 999px; color: var(--text-main); text-decoration: none; background: color-mix(in srgb, var(--bg-elevated) 92%, transparent); }
.admin-link:hover { background: var(--bg-elevated); }
.tabs { display: flex; gap: .5rem; margin-top: .75rem; }
.tabs a { padding: .4rem .8rem; border: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-elevated) 92%, transparent); color: var(--text-main); text-decoration: none; border-radius: 8px; }
.tabs a.active { background: var(--bg-elevated); border-color: #999; font-weight: 600; }

/* Mobile responsiveness */
@media (max-width: 640px) {
  .app-header-title { font-size: 1.25rem; line-height: 1.2; }
  .app-header-subtitle { font-size: .95rem; }
  .header-row { flex-direction: column; align-items: flex-start; gap: .6rem; }
  .header-actions { align-self: stretch; justify-content: space-between; }
  .theme-toggle, .admin-link { padding: .35rem .7rem; }
  .tabs { margin-top: .5rem; }
}
</style>
