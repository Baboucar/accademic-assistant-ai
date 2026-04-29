<script setup>
import { ref, onMounted } from 'vue';
import { adminListSources, adminUploadFile, adminDeleteSource, adminReingest } from '../api.js';

const creds = ref({ user: '', pass: '' });
const authed = ref(false);
const error = ref('');
const sources = ref([]);
const upFile = ref(null);
const upType = ref('timetable');
const upSemester = ref('');
const reingestFlag = ref(true);
const loading = ref(false);

// Persist session across refreshes
onMounted(() => {
  const saved = sessionStorage.getItem('admin_authed');
  const savedCreds = sessionStorage.getItem('admin_creds');
  if (saved === 'true' && savedCreds) {
    creds.value = JSON.parse(savedCreds);
    load();
  }
});

async function load() {
  error.value = '';
  loading.value = true;
  try {
    const r = await adminListSources(creds.value);
    sources.value = r.sources || [];
    authed.value = true;
    sessionStorage.setItem('admin_authed', 'true');
    sessionStorage.setItem('admin_creds', JSON.stringify(creds.value));
  } catch (e) {
    authed.value = false;
    error.value = 'Auth failed or server error.';
    sessionStorage.removeItem('admin_authed');
  } finally {
    loading.value = false;
  }
}

function logout() {
  authed.value = false;
  sources.value = [];
  sessionStorage.removeItem('admin_authed');
  sessionStorage.removeItem('admin_creds');
}

async function doUpload() {
  if (!upFile.value?.files?.[0]) return;
  loading.value = true;
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
  } finally {
    loading.value = false;
  }
}

async function doDelete(file, alsoRemove) {
  if (!confirm(`Delete ${file}?`)) return;
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
    await load();
  } catch (e) {
    error.value = String(e?.message || e);
  }
}
</script>

<template>
  <div class="admin-panel">
    <!-- Login Screen -->
    <div v-if="!authed" class="login-box">
      <h2>Admin</h2>
      <p class="hint">Provide admin username and password to manage files.</p>
      <div class="login-row">
        <input v-model="creds.user" placeholder="Username" :disabled="loading" />
        <input v-model="creds.pass" placeholder="Password" type="password" :disabled="loading" />
        <button @click="load" :disabled="loading">{{ loading ? 'Loading...' : 'Login' }}</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <!-- Dashboard -->
    <div v-if="authed" class="authed">
      <div class="dash-header">
        <h2>Admin Dashboard</h2>
        <button @click="logout" class="logout-btn">Logout</button>
      </div>

      <section class="upload">
        <h3>Upload Source</h3>
        <input type="file" ref="upFile" :disabled="loading" />
        <select v-model="upType" :disabled="loading">
          <option value="timetable">timetable</option>
          <option value="calendar">calendar</option>
          <option value="notices">notices</option>
        </select>
        <input v-model="upSemester" placeholder="Semester (optional)" :disabled="loading" />
        <label><input type="checkbox" v-model="reingestFlag" :disabled="loading" /> Re-ingest immediately</label>
        <button @click="doUpload" :disabled="loading">Upload</button>
      </section>

      <section class="sources">
        <h3>Sources ({{ sources.length }})</h3>
        <table class="src-table">
          <thead><tr><th>Type</th><th>File</th><th>Semester</th><th>Ingested</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="s in sources" :key="s.source_file + s.type">
              <td>{{ s.type }}</td>
              <td>{{ s.source_file }}</td>
              <td>{{ s.semester || '-' }}</td>
              <td>{{ s.ingested_at }}</td>
              <td>
                <button @click="doReingest(s.source_file)" :disabled="loading">Reingest</button>
                <button @click="doDelete(s.source_file, false)" :disabled="loading">Delete (DB)</button>
                <button @click="doDelete(s.source_file, true)" :disabled="loading">Delete (DB+File)</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="error" class="error">{{ error }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.admin-panel { max-width: 900px; margin: 0 auto; padding: 1rem; }

/* Login */
.login-box { text-align: center; margin-top: 2rem; }
.hint { color: #666; margin-bottom: 1rem; }
.login-row { display: flex; gap: .5rem; margin-bottom: 1rem; justify-content: center; }
.login-row input { padding: .4rem .6rem; }
.login-row button { padding: .4rem .8rem; }

/* Dashboard */
.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.logout-btn { background: #e74c3c; color: white; border: none; padding: .4rem 1rem; border-radius: 4px; }
.logout-btn:hover { background: #c0392b; }

.error { color: #c0392b; }
.upload { display: grid; gap: .5rem; margin: 1rem 0; }
.src-table { width: 100%; border-collapse: collapse; }
.src-table th, .src-table td { border: 1px solid #ddd; padding: .4rem .5rem; font-size: .9rem; }
.src-table th { background: #f8f8f8; }
button { cursor: pointer; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>