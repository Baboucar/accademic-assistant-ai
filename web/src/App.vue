<script setup>
import ChatPanel from './components/ChatPanel.vue';
</script>

<template>
  <div class="app-root">
    <div class="app-shell">
      <header class="app-header">
        <h1 class="app-header-title">UTG Academic Assistant</h1>
        <p class="app-header-subtitle">
          Ask about timetables, courses, lecturers, and schedules.
        </p>
      </header>

      <main class="chat-root">
        <ChatPanel />
      </main>
    </div>
  </div>
</template>
