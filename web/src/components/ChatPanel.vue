<script setup>
import { ref, nextTick } from 'vue';
import { sendQuestionStream } from '../api.js';

const messages = ref([
  {
    role: 'assistant',
    text:
        'Hi, I am the UTG Academic Assistant. You can ask things like ' +
        '"Who is teaching AI?" or "Show Monday schedule."',
  },
]);

const input = ref('');
const inputEl = ref(null);
const loading = ref(false);
const error = ref('');
const debugLastTool = ref(null);
const lastQuestion = ref('');
const aborter = ref(null);

const chatWindow = ref(null);
const copiedIdx = ref(-1); // transient UI state for "Copied"

async function onSubmit() {
  const q = input.value.trim();
  if (!q || loading.value) return;

  error.value = '';
  input.value = '';
  lastQuestion.value = q;

  messages.value.push({ role: 'user', text: q });

  await nextTick();
  scrollToBottom();

  loading.value = true;
  try {
    // streaming message placeholder
    const assistantMsg = { role: 'assistant', text: '' };
    messages.value.push(assistantMsg);
    await nextTick();
    scrollToBottom();

    // set up abort controller for Stop action
    aborter.value = new AbortController();

    const tool = await sendQuestionStream(q, (chunk) => {
      assistantMsg.text += chunk;
      // keep scrolled
      nextTick().then(scrollToBottom);
    }, { signal: aborter.value.signal });

    debugLastTool.value = tool || null;

    await nextTick();
    scrollToBottom();
  } catch (e) {
    if (e?.name === 'AbortError') {
      // User pressed Stop; keep partial text if any, do not show error
      messages.value.push({ role: 'assistant', text: '(stopped)' });
    } else {
      console.error(e);
      error.value = String(e?.message || e);
      messages.value.push({ role: 'assistant', text: 'Sorry, something went wrong talking to the server.' });
    }
  } finally {
    loading.value = false;
    aborter.value = null;
  }
}

function scrollToBottom() {
  const el = chatWindow.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function isLastUserEditable(idx) {
  // Allow editing the most recent question (last user message),
  // optionally with a trailing assistant reply we inserted.
  const lastIdx = messages.value.length - 1;
  if (lastIdx < 0) return false;
  const last = messages.value[lastIdx];
  // Case A: last message is a user message and this is it
  if (idx === lastIdx && last.role === 'user') return true;
  // Case B: last is assistant, previous is user and this idx points to that user
  if (last.role === 'assistant' && lastIdx - 1 === idx && messages.value[idx].role === 'user') return true;
  return false;
}

function editMessage(idx) {
  if (loading.value) return; // don't allow edits mid-stream
  const m = messages.value[idx];
  if (!m || m.role !== 'user') return;

  // If the last message is assistant and directly follows this user msg, remove it
  const lastIdx = messages.value.length - 1;
  if (lastIdx >= 0 && lastIdx === idx + 1 && messages.value[lastIdx].role === 'assistant') {
    messages.value.splice(lastIdx, 1);
  }
  // Remove the user message itself
  messages.value.splice(idx, 1);

  // Put text back into the input for editing
  input.value = m.text || '';
  nextTick(() => {
    if (inputEl.value) {
      inputEl.value.focus();
      // move caret to end
      const end = input.value.length;
      inputEl.value.setSelectionRange?.(end, end);
    }
    scrollToBottom();
  });
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onSubmit();
  }
}

function stopStreaming() {
  if (loading.value && aborter.value) {
    try { aborter.value.abort(); } catch {}
  }
}

function retryLast() {
  if (loading.value) return;
  if (!lastQuestion.value) return;
  input.value = lastQuestion.value;
  nextTick(() => onSubmit());
}

async function copyMessage(idx) {
  const m = messages.value[idx];
  if (!m?.text) return;
  try {
    await navigator.clipboard?.writeText(m.text);
    copiedIdx.value = idx;
    setTimeout(() => { if (copiedIdx.value === idx) copiedIdx.value = -1; }, 1200);
  } catch {}
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
        <div class="msg-actions" :class="m.role">
          <button
            class="ghost-btn"
            type="button"
            @click="copyMessage(idx)"
            :title="'Copy message'"
            :aria-label="'Copy message'"
          >
            <span v-if="copiedIdx===idx">Copied</span>
            <span v-else>Copy</span>
          </button>
          <button
            v-if="m.role==='user' && isLastUserEditable(idx)"
            class="ghost-btn"
            type="button"
            @click="editMessage(idx)"
            :disabled="loading"
            title="Edit your last question"
            aria-label="Edit your last question"
          >Edit</button>
        </div>
      </div>
    </section>

    <form class="chat-input-row" @submit.prevent="onSubmit">
      <textarea
          v-model="input"
          ref="inputEl"
          placeholder="Type a question, e.g. 'Who is teaching AI?' or 'Show Monday schedule'"
          rows="2"
          @keydown="onKeydown"
      ></textarea>
      <button v-if="!loading" type="submit" :disabled="!input.trim()">Send</button>
      <button v-else type="button" class="secondary" @click="stopStreaming">Stop</button>
    </form>

    <div class="chat-footer">
      <span v-if="error" class="chat-error">{{ error }}</span>
      <span v-else>Powered by local files + Groq model.</span>
      <div class="chat-actions">
        <button type="button" class="link-btn" @click="retryLast" :disabled="loading || !lastQuestion">Retry last</button>
      </div>
    </div>

    <details v-if="debugLastTool" class="debug-block">
      <summary>Debug: toolAnswer</summary>
      <pre>{{ debugLastTool }}</pre>
    </details>
  </div>
</template>

<style scoped>
.msg-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.msg-actions.user { justify-content: flex-end; }
.msg-actions.assistant { justify-content: flex-start; }

.ghost-btn {
  background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.75rem;
  cursor: pointer;
}
.ghost-btn:hover { color: var(--text-main); background: var(--bg-elevated); }
.ghost-btn:disabled { opacity: .6; cursor: default; }
</style>
<style scoped>
.chat-input-row button.secondary {
  background: var(--bg-elevated);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
  box-shadow: none;
}
</style>
