<script setup>
import { ref, nextTick, computed } from 'vue';
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

// Enable the Retry button when we have something to retry and not currently loading
const canRetry = computed(() => {
  if (loading.value) return false;
  if ((lastQuestion.value || '').trim()) return true;
  // Fallback: any previous non-empty user message
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i];
    if (m.role === 'user' && (m.text || '').trim()) return true;
  }
  return false;
});

const chatWindow = ref(null);
const copiedIdx = ref(-1); // transient UI state for "Copied"

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

// Minimal Markdown → HTML for readability without extra deps.
// Escapes HTML, supports headings (#, ##, ###), bold (** **), italics (* *),
// and simple unordered/ordered lists and paragraphs.
function mdToHtml(text) {
  const escapeHtml = (s) =>
      (s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

  const fmtInline = (s) => {
    // Bold then italics (simple, non-greedy)
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
      const level = h[1].length; // 1..3
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
// - Turns the day into a heading when it starts with "On <Day>, ..."
// - Converts "From HH:MM to HH:MM, ..." blocks into bullet points
// - Bolds detected time ranges and key separators
function formatAssistantText(text) {
  if (!text) return '';

  const time = "(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?(?:AM|PM))?"; // 8:30 or 14:30 or 8:30 PM
  const timeRangeRe = new RegExp(`\\b(${time})\\s*(?:to|\u2013|-|—)\\s*(${time})\\b`, 'ig');

  const lines = text.split(/\r?\n/);
  const out = [];

  // Optional heading from first line
  if (lines.length) {
    const m = lines[0].match(/^\s*On\s+([A-Za-z]+)\b.*$/i);
    if (m) {
      out.push(`### ${m[1][0].toUpperCase()}${m[1].slice(1)} Schedule`);
    }
  }

  for (let raw of lines) {
    let s = raw.trim();
    if (!s) { out.push(''); continue; }

    // Normalize and bold time ranges
    s = s.replace(timeRangeRe, (all, a, b) => `**${a}–${b}**`);

    // Convert blocks that start with "From <time> to <time>," into list items
    const block = s.match(new RegExp(`^From\\s+(${time})\\s*(?:to|\u2013|-|—)\\s*(${time})[:,]?\\s*(.*)$`, 'i'));
    if (block) {
      const rest = block[3] || '';
      out.push(`- **${block[1]}–${block[2]}:** ${rest}`);
      continue;
    }

    // If a line starts with a single time (e.g., "At 10:00 ..."), make the time bold
    s = s.replace(new RegExp(`^(At|From)\\s+(${time})\\b`, 'i'), (m, prefix, t) => `${prefix} **${t}**`);

    // Bold a weekday after leading "On <Day>,"
    s = s.replace(/^On\s+([A-Za-z]+)\b(.*)$/i, (m, d, rest) => `On **${d}**${rest}`);

    // Bold lecturer names after phrases like "lectured by" or "taught by"
    s = s.replace(/\b(lectured by|taught by)\s+([^.;,]+)/gi, (m, by, name) => `${by} **${name.trim()}**`);

    // More lecturer phrasings
    s = s.replace(/\b(led by|facilitated by|handled by|supervised by|instructed by|delivered by|presented by)\s+([^.;,]+)/gi,
      (m, by, name) => `${by} **${name.trim()}**`);

    // "with <Name>" (titles optional)
    s = s.replace(/\bwith\s+((?:(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Professor)\s+)?[A-Z][A-Za-z'’.\-]*(?:\s+[A-Z][A-Za-z'’.\-]*){0,3})\b(?=[,.;]|$)/g,
      (m, name) => `with **${name.trim()}**`);

    // Bold venue names after common prepositions or explicit labels
    // Examples: "in the Theater, lectured by ..." → bold "Theater"
    //           "at Lecture Hall 1." → bold "Lecture Hall 1"
    s = s.replace(/\b(in|at)\s+(the\s+)?([^.,;]+?)(?=(\s+(?:with|by|lectured|taught|led|facilitated|handled|supervised|instructed|delivered|presented)\b|[.,;]|$))/gi,
      (m, prep, theWord, venue) => `${prep} ${theWord || ''}**${venue.trim()}**`);
    s = s.replace(/\bvenue\s*:\s*([^.;,]+)/gi, (m, v) => `venue: **${v.trim()}**`);

    // Bold course names in common phrasings
    // "you can attend <Course> in ..." or "you can attend <Course>, lectured by ..."
    s = s.replace(/\byou can attend\s+([^.;,]+?)(?=(\s+in\b|\s*,\s*(?:lectured|taught)\b|[.;]))/i,
      (m, course) => `you can attend **${course.trim()}**`);

    // "including <Course>" (keep reading until punctuation or conjunctions)
    s = s.replace(/\bincluding\s+([^.;,]+?)(?=(\s+(?:but|and)\b|[.;]))/gi,
      (m, course) => `including **${course.trim()}**`);

    // "class on <Course>" or "course on <Course>"
    s = s.replace(/\b(?:class|course)\s+on\s+([^.;,]+?)(?=(\s+(?:from|at|in)\b|[.;,]))/gi,
      (m, course) => `class on **${course.trim()}**`);

    out.push(s);
  }

  return out.join('\n');
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
  let q = (lastQuestion.value || '').trim();
  if (!q) {
    // Fallback: find the most recent user message text
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m.role === 'user' && (m.text || '').trim()) {
        q = m.text.trim();
        break;
      }
    }
  }
  if (!q) return;
  input.value = q;
  nextTick(() => {
    try { inputEl.value?.focus?.(); } catch {}
    onSubmit();
  });
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
      <span v-if="error" class="chat-error">{{ error }}</span>
      <span v-else>Powered by local files + Groq model.</span>
<!--      <div class="chat-actions">-->
<!--        <button type="button" class="secondary" @click="retryLast" :disabled="!canRetry">Retry last</button>-->
<!--      </div>-->
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
<style scoped>
/* Mobile responsiveness tweaks */
@media (max-width: 640px) {
  .chat-window { padding: 10px; }
  .msg-label { font-size: .8rem; }
  .msg-bubble { font-size: 0.975rem; line-height: 1.45; }
  .chat-input-row { gap: 8px; }
  .chat-input-row textarea { min-height: 56px; font-size: 1rem; }
  .chat-input-row button { height: 44px; padding: 0 16px; }
  .chat-footer { flex-direction: column; gap: 8px; align-items: flex-start; }
  .chat-actions { width: 100%; display: flex; justify-content: flex-end; }
}
</style>
