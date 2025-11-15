<script setup>
import { ref, nextTick } from 'vue';
import { sendQuestion } from '../api.js';

const messages = ref([
  {
    role: 'assistant',
    text:
        'Hi, I am the UTG Academic Assistant. You can ask things like ' +
        '"Who is teaching AI?" or "Show Monday schedule for CS."',
  },
]);

const input = ref('');
const loading = ref(false);
const error = ref('');
const debugLastTool = ref(null);

const chatWindow = ref(null);

async function onSubmit() {
  const q = input.value.trim();
  if (!q || loading.value) return;

  error.value = '';
  input.value = '';

  messages.value.push({ role: 'user', text: q });

  await nextTick();
  scrollToBottom();

  loading.value = true;
  try {
    const res = await sendQuestion(q);

    messages.value.push({
      role: 'assistant',
      text: res.answer || 'I could not find it.',
    });

    debugLastTool.value = res.toolAnswer || null;

    await nextTick();
    scrollToBottom();
  } catch (e) {
    console.error(e);
    error.value = String(e?.message || e);
    messages.value.push({
      role: 'assistant',
      text: 'Sorry, something went wrong talking to the server.',
    });
  } finally {
    loading.value = false;
  }
}

function scrollToBottom() {
  const el = chatWindow.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}
</script>

<template>
  <div class="chat-panel">
    <section ref="chatWindow" class="chat-window">
      <div
          v-for="(m, idx) in messages"
          :key="idx"
          class="msg"
          :class="m.role"
      >
        <div class="msg-label">
          {{ m.role === 'user' ? 'You' : 'Assistant' }}
        </div>
        <div class="msg-bubble">
          {{ m.text }}
        </div>
      </div>
    </section>

    <form class="chat-input-row" @submit.prevent="onSubmit">
      <textarea
          v-model="input"
          placeholder="Type a question, e.g. 'Who is teaching AI?' or 'Show Monday schedule for CS.'"
          rows="2"
      ></textarea>
      <button type="submit" :disabled="loading || !input.trim()">
        {{ loading ? 'Thinking…' : 'Send' }}
      </button>
    </form>

    <div class="chat-footer">
      <span v-if="error" class="chat-error">{{ error }}</span>
      <span v-else>Powered by local files + Groq model.</span>
    </div>

    <details v-if="debugLastTool" class="debug-block">
      <summary>Debug: toolAnswer</summary>
      <pre>{{ debugLastTool }}</pre>
    </details>
  </div>
</template>
