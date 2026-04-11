<script setup>
import { ref, nextTick } from 'vue';
import { sendQuestion, streamQuestion } from '../api.js';

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
const useStreaming = ref(true);

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
    if (useStreaming.value) {
      await handleStreamingResponse(q);
    } else {
      const res = await sendQuestion(q);
      messages.value.push({
        role: 'assistant',
        text: res.answer || 'I could not find it.',
      });
      debugLastTool.value = res.toolAnswer || null;
    }

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

async function handleStreamingResponse(question) {
  const assistantMessage = { role: 'assistant', text: '' };
  messages.value.push(assistantMessage);
  
  const messageIndex = messages.value.length - 1;
  let fullContent = '';
  
  try {
    for await (const chunk of streamQuestion(question)) {
      if (chunk.type === 'metadata') {
        debugLastTool.value = chunk.toolAnswer || null;
      } else if (chunk.type === 'content') {
        fullContent += chunk.content;
      } else if (chunk.type === 'error') {
        throw new Error(chunk.error);
      }
    }
    
    // Display word by word with natural typing speed
    const words = fullContent.split(/(\s+)/);
    let displayText = '';
    
    for (const word of words) {
      displayText += word;
      assistantMessage.text = displayText;
      messages.value[messageIndex] = { ...assistantMessage };
      
      await nextTick();
      scrollToBottom();
      
      // Natural typing delays
      if (word.trim().endsWith('.') || word.trim().endsWith('!') || word.trim().endsWith('?')) {
        await new Promise(resolve => setTimeout(resolve, 200));
      } else if (word.trim().endsWith(',')) {
        await new Promise(resolve => setTimeout(resolve, 100));
      } else if (word === ' ') {
        await new Promise(resolve => setTimeout(resolve, 20));
      } else {
        const delay = 30 + Math.random() * 40;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    if (!assistantMessage.text) {
      assistantMessage.text = 'I could not find it.';
      messages.value[messageIndex] = { ...assistantMessage };
    }
  } catch (streamError) {
    messages.value.splice(messageIndex, 1);
    throw streamError;
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
      <div class="footer-left">
        <label class="stream-toggle">
          <input 
            type="checkbox" 
            v-model="useStreaming" 
          />
          <span>Real-time streaming</span>
        </label>
      </div>
      <div class="footer-right">
        <span v-if="error" class="chat-error">{{ error }}</span>
        <span v-else>Powered by local files + Groq model.</span>
      </div>
    </div>

    <details v-if="debugLastTool" class="debug-block">
      <summary>Debug: toolAnswer</summary>
      <pre>{{ debugLastTool }}</pre>
    </details>
  </div>
</template>

<style scoped>
/* Additional styles that work with the global style.css */
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.footer-left {
  display: flex;
  align-items: center;
}

.stream-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}

.stream-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent);
  margin: 0;
}

.stream-toggle span {
  color: var(--text-muted);
  font-size: 0.85rem;
  transition: color 0.15s;
}

.stream-toggle:hover span {
  color: var(--text-main);
}

.footer-right {
  text-align: right;
}

.debug-block pre {
  margin: 8px 0 0;
  padding: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-size: 0.75rem;
  color: var(--text-main);
}

/* Ensure textarea matches global style */
.chat-input-row textarea {
  font-family: var(--font-sans);
}
</style>