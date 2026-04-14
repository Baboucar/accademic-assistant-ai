<script setup>
import { ref, nextTick, computed } from 'vue';
import { sendQuestion, sendQuestionStream } from '../api.js';

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
const useStreaming = ref(true); // NEW: Toggle for streaming mode

// Enable the Retry button when we have something to retry and not currently loading
const canRetry = computed(() => {
  if (loading.value) return false;
  if ((lastQuestion.value || '').trim()) return true;
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i];
    if (m.role === 'user' && (m.text || '').trim()) return true;
  }
  return false;
});

const chatWindow = ref(null);
const copiedIdx = ref(-1);

async function onSubmit(qOverride) {
  const q = (typeof qOverride === 'string' ? qOverride : input.value).trim();
  if (!q || loading.value) return;

  error.value = '';
  input.value = '';
  lastQuestion.value = q;

  messages.value.push({ role: 'user', text: q });

  await nextTick();
  scrollToBottom();

  loading.value = true;
  
  try {
    if (useStreaming.value) {
      // STREAMING MODE with natural typing speed
      await handleStreamingResponse(q);
    } else {
      // NON-STREAMING MODE (instant)
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
    if (e?.name === 'AbortError') {
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

async function handleStreamingResponse(question) {
  // Create placeholder for streaming
  const assistantMsg = { role: 'assistant', text: '' };
  messages.value.push(assistantMsg);
  const messageIndex = messages.value.length - 1;
  
  // Set up abort controller
  aborter.value = new AbortController();
  
  // Buffer to collect chunks for natural typing
  let fullContent = '';
  let toolAnswer = null;
  
  try {
    // Collect all content first (backend streams instantly)
    await sendQuestionStream(question, (chunk) => {
      fullContent += chunk;
    }, { signal: aborter.value.signal });
    
    // Now display word by word with natural typing speed
    const words = fullContent.split(/(\s+)/); // Split keeping spaces
    let displayText = '';
    
    for (const word of words) {
      // Check if aborted during typing
      if (aborter.value?.signal?.aborted) {
        assistantMsg.text = displayText + ' (stopped)';
        messages.value[messageIndex] = { ...assistantMsg };
        return;
      }
      
      displayText += word;
      assistantMsg.text = displayText;
      messages.value[messageIndex] = { ...assistantMsg };
      
      await nextTick();
      scrollToBottom();
      
      // Natural typing delays based on punctuation
      if (word.trim().endsWith('.') || word.trim().endsWith('!') || word.trim().endsWith('?')) {
        await new Promise(resolve => setTimeout(resolve, 200)); // End of sentence
      } else if (word.trim().endsWith(',')) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Comma pause
      } else if (word.trim().endsWith(':')) {
        await new Promise(resolve => setTimeout(resolve, 150)); // Colon pause
      } else if (word === ' ') {
        await new Promise(resolve => setTimeout(resolve, 15)); // Space is quick
      } else {
        // Random delay between 30-70ms per word for natural variation
        const delay = 25 + Math.random() * 45;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If no content was streamed, show fallback
    if (!assistantMsg.text) {
      assistantMsg.text = 'I could not find it.';
      messages.value[messageIndex] = { ...assistantMsg };
    }
    
  } catch (streamError) {
    if (streamError?.name !== 'AbortError') {
      throw streamError;
    }
  }
}

function scrollToBottom() {
  const el = chatWindow.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

// Minimal Markdown → HTML for readability without extra deps.
function mdToHtml(text) {
  const escapeHtml = (s) =>
      (s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

  const fmtInline = (s) => {
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*(?!\s)(.+?)(?!\s)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  };

  const lines = escapeHtml(text).split(/\r?\n/);
  let html = '';
  let inUL = false;
  let inOL = false;

  const closeLists = () => {
    if (inUL) { html += '</ul>'; inUL = false; }
    if (inOL) { html += '</ol>'; inOL = false; }
  };

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeLists();
      html += '<br />';
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      html += `<${tag}>${fmtInline(h[2])}</${tag}>`;
      continue;
    }

    let m;
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inUL) { closeLists(); html += '<ul>'; inUL = true; }
      html += `<li>${fmtInline(m[1])}</li>`;
      continue;
    }
    if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (!inOL) { closeLists(); html += '<ol>'; inOL = true; }
      html += `<li>${fmtInline(m[1])}</li>`;
      continue;
    }

    closeLists();
    html += `<p>${fmtInline(line)}</p>`;
  }
  closeLists();
  return html;
}

// Heuristic auto-formatting to make assistant replies more scannable.
function formatAssistantText(text) {
  if (!text) return '';

  const time = "(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?(?:AM|PM))?";
  const timeRangeRe = new RegExp(`\\b(${time})\\s*(?:to|\u2013|-|—)\\s*(${time})\\b`, 'ig');

  const lines = text.split(/\r?\n/);
  const out = [];

  if (lines.length) {
    const m = lines[0].match(/^\s*On\s+([A-Za-z]+)\b.*$/i);
    if (m) {
      out.push(`### ${m[1][0].toUpperCase()}${m[1].slice(1)} Schedule`);
    }
  }

  for (let raw of lines) {
    let s = raw.trim();
    if (!s) { out.push(''); continue; }

    s = s.replace(timeRangeRe, (all, a, b) => `**${a}–${b}**`);

    const block = s.match(new RegExp(`^From\\s+(${time})\\s*(?:to|\u2013|-|—)\\s*(${time})[:,]?\\s*(.*)$`, 'i'));
    if (block) {
      const rest = block[3] || '';
      out.push(`- **${block[1]}–${block[2]}:** ${rest}`);
      continue;
    }

    s = s.replace(new RegExp(`^(At|From)\\s+(${time})\\b`, 'i'), (m, prefix, t) => `${prefix} **${t}**`);
    s = s.replace(/^On\s+([A-Za-z]+)\b(.*)$/i, (m, d, rest) => `On **${d}**${rest}`);
    s = s.replace(/\b(lectured by|taught by)\s+([^.;,]+)/gi, (m, by, name) => `${by} **${name.trim()}**`);
    s = s.replace(/\b(led by|facilitated by|handled by|supervised by|instructed by|delivered by|presented by)\s+([^.;,]+)/gi,
      (m, by, name) => `${by} **${name.trim()}**`);
    s = s.replace(/\bwith\s+((?:(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Professor)\s+)?[A-Z][A-Za-z'’.\-]*(?:\s+[A-Z][A-Za-z'’.\-]*){0,3})\b(?=[,.;]|$)/g,
      (m, name) => `with **${name.trim()}**`);
    s = s.replace(/\b(in|at)\s+(the\s+)?([^.,;]+?)(?=(\s+(?:with|by|lectured|taught|led|facilitated|handled|supervised|instructed|delivered|presented)\b|[.,;]|$))/gi,
      (m, prep, theWord, venue) => `${prep} ${theWord || ''}**${venue.trim()}**`);
    s = s.replace(/\bvenue\s*:\s*([^.;,]+)/gi, (m, v) => `venue: **${v.trim()}**`);
    s = s.replace(/\byou can attend\s+([^.;,]+?)(?=(\s+in\b|\s*,\s*(?:lectured|taught)\b|[.;]))/i,
      (m, course) => `you can attend **${course.trim()}**`);
    s = s.replace(/\bincluding\s+([^.;,]+?)(?=(\s+(?:but|and)\b|[.;]))/gi,
      (m, course) => `including **${course.trim()}**`);
    s = s.replace(/\b(?:class|course)\s+on\s+([^.;,]+?)(?=(\s+(?:from|at|in)\b|[.;,]))/gi,
      (m, course) => `class on **${course.trim()}**`);

    out.push(s);
  }

  return out.join('\n');
}

function isLastUserEditable(idx) {
  const lastIdx = messages.value.length - 1;
  if (lastIdx < 0) return false;
  const last = messages.value[lastIdx];
  if (idx === lastIdx && last.role === 'user') return true;
  if (last.role === 'assistant' && lastIdx - 1 === idx && messages.value[idx].role === 'user') return true;
  return false;
}

function editMessage(idx) {
  if (loading.value) return;
  const m = messages.value[idx];
  if (!m || m.role !== 'user') return;

  const lastIdx = messages.value.length - 1;
  if (lastIdx >= 0 && lastIdx === idx + 1 && messages.value[lastIdx].role === 'assistant') {
    messages.value.splice(lastIdx, 1);
  }
  messages.value.splice(idx, 1);

  input.value = m.text || '';
  nextTick(() => {
    if (inputEl.value) {
      inputEl.value.focus();
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
          <template v-if="m.role==='assistant'">
            <div v-html="mdToHtml(formatAssistantText(m.text))"></div>
          </template>
          <template v-else>
            {{ m.text }}
          </template>
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

/* Footer with toggle */
.chat-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
</style>

<style scoped>
.chat-input-row button.secondary {
  background: var(--bg-elevated);
  color: var(--text-main);
  border: 1px solid var(--border-subtle);
  box-shadow: none;
}
</style>

<style scoped>
@media (max-width: 640px) {
  .chat-window { padding: 10px; }
  .msg-label { font-size: .8rem; }
  .msg-bubble { font-size: 0.975rem; line-height: 1.45; }
  .chat-input-row { gap: 8px; }
  .chat-input-row textarea { min-height: 56px; font-size: 1rem; }
  .chat-input-row button { height: 44px; padding: 0 16px; }
  .chat-footer { flex-direction: row; flex-wrap: wrap; gap: 8px; }
}
</style>