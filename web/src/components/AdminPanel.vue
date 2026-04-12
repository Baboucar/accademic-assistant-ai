<script setup>
import { ref } from 'vue';
import { adminListSources, adminUploadFile, adminDeleteSource, adminReingest } from '../api.js';

const creds = ref({ user: '', pass: '' });
const authed = ref(false);
const error = ref('');
const sources = ref([]);
const upFile = ref(null);
const upType = ref('timetable');
const upSemester = ref('');
const reingestFlag = ref(true);

async function load() {
  error.value = '';
  try {
    const r = await adminListSources(creds.value);
    sources.value = r.sources || [];
    authed.value = true;
  } catch (e) {
    authed.value = false;
    error.value = 'Auth failed or server error.';
  }
}

async function doUpload() {
  if (!upFile.value?.files?.[0]) return;
  try {
    await adminUploadFile(creds.value, upFile.value.files[0], {
      type: upType.value,
      semester: upSemester.value,
      reingest: reingestFlag.value ? '1' : '0',
    });
    await load();
    upFile.value.value = '';
  } catch (e) {
    error.value = String(e?.message || e);
  }
}

async function doDelete(file, alsoRemove) {
  try {
    await adminDeleteSource(creds.value, file, alsoRemove);
    await load();
  } catch (e) {
    error.value = String(e?.message || e);
  }
}

async function doReingest(file = '') {
  try {
    await adminReingest(creds.value, { file, semester: upSemester.value });
  } catch (e) {
    error.value = String(e?.message || e);
  }
}

// Do not auto-call admin APIs on mount to avoid 401 noise on first load.
</script>

<template>
  <div class="admin-panel">
    <h2>Admin</h2>
    <p class="hint">Provide admin username and password to manage files.</p>

    <div class="login-row">
      <input v-model="creds.user" placeholder="Username" />
      <input v-model="creds.pass" placeholder="Password" type="password" />
      <button @click="load">Login</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="authed" class="authed">
      <section class="upload">
        <h3>Upload Source</h3>
        <input type="file" ref="upFile" />
        <select v-model="upType">
          <option value="timetable">timetable</option>
          <option value="calendar">calendar</option>
          <option value="notices">notices</option>
        </select>
        <input v-model="upSemester" placeholder="Semester (optional)" />
        <label><input type="checkbox" v-model="reingestFlag" /> Re-ingest immediately</label>
        <button @click="doUpload">Upload</button>
      </section>

      <section class="sources">
        <h3>Sources</h3>
        <table class="src-table">
          <thead><tr><th>Type</th><th>File</th><th>Semester</th><th>Ingested</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="s in sources" :key="s.source_file + s.type">
              <td>{{ s.type }}</td>
              <td>{{ s.source_file }}</td>
              <td>{{ s.semester || '-' }}</td>
              <td>{{ s.ingested_at }}</td>
              <td>
                <button @click="doReingest(s.source_file)">Reingest</button>
                <button @click="doDelete(s.source_file, false)">Delete (DB)</button>
                <button @click="doDelete(s.source_file, true)">Delete (DB+File)</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
  
</template>

<style scoped>
.admin-panel { max-width: 900px; margin: 0 auto; padding: 1rem; }
.hint { color: #666; }
.login-row { display: flex; gap: .5rem; margin-bottom: 1rem; }
.login-row input { padding: .4rem .6rem; }
.login-row button { padding: .4rem .8rem; }
.error { color: #c0392b; }
.upload { display: grid; gap: .5rem; margin: 1rem 0; }
.src-table { width: 100%; border-collapse: collapse; }
.src-table th, .src-table td { border: 1px solid #ddd; padding: .4rem .5rem; font-size: .9rem; }
.src-table th { background: #f8f8f8; }
button { cursor: pointer; }
</style>
