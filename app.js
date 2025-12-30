const $ = (id) => document.getElementById(id);

const state = {
  unlocked: false,
  vaultKey: null,
  vault: { meta: { version: 1, createdAt: null }, apiKey: null, sessions: [], profile: { accept: 0, reject: 0 } },
};

const VAULT_STORAGE_KEY = "carltons_loadies_vault_v1";

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(passphrase, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64 ? new Uint8Array(b64ToBuf(saltB64)) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return { key, saltB64: saltB64 || bufToB64(salt.buffer) };
}

async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const pt = enc.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  return { ivB64: bufToB64(iv.buffer), ctB64: bufToB64(ct) };
}

async function decryptJson(key, ivB64, ctB64) {
  const iv = new Uint8Array(b64ToBuf(ivB64));
  const ct = b64ToBuf(ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(pt));
}

function loadEncryptedBlob() {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveEncryptedBlob(blob) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(blob));
}

function setUiUnlocked(on) {
  state.unlocked = on;
  $("lockBtn").disabled = !on;
  $("saveKeyBtn").disabled = !on;
  $("riffBtn").disabled = !on;
  $("saveBtn").disabled = !on;
  $("exportBtn").disabled = !on;
  $("wipeBtn").disabled = !on;
}

async function saveVault() {
  const blob0 = loadEncryptedBlob();
  const saltB64 = blob0?.saltB64;
  const { key, saltB64: newSalt } = await deriveKey($("passphrase").value, saltB64);
  state.vaultKey = key;

  const encrypted = await encryptJson(key, state.vault);
  saveEncryptedBlob({ saltB64: newSalt, ivB64: encrypted.ivB64, ctB64: encrypted.ctB64 });
}

async function unlockOrCreate() {
  const pass = $("passphrase").value;
  if (!pass || pass.length < 6) {
    alert("Use a longer passphrase (6+ chars).");
    return;
  }

  const blob = loadEncryptedBlob();
  const { key, saltB64 } = await deriveKey(pass, blob?.saltB64);

  try {
    if (blob) {
      const vault = await decryptJson(key, blob.ivB64, blob.ctB64);
      state.vault = vault;
    } else {
      state.vault.meta.createdAt = new Date().toISOString();
      state.vault.profile = { accept: 0, reject: 0 };
      const encrypted = await encryptJson(key, state.vault);
      saveEncryptedBlob({ saltB64, ivB64: encrypted.ivB64, ctB64: encrypted.ctB64 });
    }
    state.vaultKey = key;
    setUiUnlocked(true);
    $("output").textContent = `Vault unlocked. Sessions: ${state.vault.sessions.length}`;
  } catch (e) {
    alert("Could not unlock vault. Wrong passphrase?");
  }
}

function lock() {
  state.unlocked = false;
  state.vaultKey = null;
  $("apiKey").value = "";
  setUiUnlocked(false);
  $("output").textContent = "Locked.";
}

async function saveApiKey() {
  const key = $("apiKey").value.trim();
  if (!key) return alert("Paste your API key first.");
  state.vault.apiKey = key;
  await saveVault();
  $("apiKey").value = "";
  $("output").textContent = "API key saved (encrypted in vault).";
}

// OpenAI Responses API is recommended for new projects.  [oai_citation:0‡OpenAI Platform](https://platform.openai.com/docs/api-reference/responses?utm_source=chatgpt.com)
async function callOpenAI(promptText) {
  const apiKey = state.vault.apiKey;
  if (!apiKey) throw new Error("No API key saved. Add one in the AI section.");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: promptText
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg);
  }
  const data = await res.json();
  // Responses shape: return combined text from output blocks
  const text = (data.output || [])
    .flatMap(o => o.content || [])
    .filter(c => c.type === "output_text")
    .map(c => c.text)
    .join("\n");
  return text || "[No text returned]";
}

function buildPrompt(setup, tone) {
  const profile = state.vault.profile;
  const bias = profile.accept >= profile.reject ? "more confident, tighter tags" : "safer, clearer tags";
  return [
    "You are Carlton’s Loadies: a comedy sparring partner.",
    "Rules:",
    "- Do NOT reference or imitate real comedians.",
    "- Do NOT claim ownership of jokes.",
    "- Provide 5 tag options, then 2 alternate angles.",
    `Tone: ${tone}.`,
    `Preference bias (from user feedback): ${bias}.`,
    "User setup/premise:",
    setup
  ].join("\n");
}

async function riff() {
  const setup = $("setup").value.trim();
  if (!setup) return alert("Type a setup first.");

  const tone = $("tone").value;
  $("output").textContent = "Generating…";

  try {
    const prompt = buildPrompt(setup, tone);
    const text = await callOpenAI(prompt);
    $("output").textContent = text;

    state._last = { setup, tone, output: text, ts: new Date().toISOString(), accepted: null };
  } catch (e) {
    $("output").textContent = `Error: ${e.message}`;
  }
}

async function saveSession() {
  if (!state._last) return alert("Generate first.");
  state.vault.sessions.push(state._last);
  await saveVault();
  $("output").textContent = `Saved. Total sessions: ${state.vault.sessions.length}`;
}

async function acceptReject(val) {
  if (!state._last) return alert("Generate first.");
  state._last.accepted = val;
  if (val) state.vault.profile.accept += 1;
  else state.vault.profile.reject += 1;
  await saveVault();
  $("output").textContent = val ? "Accepted (profile updated locally)." : "Rejected (profile updated locally).";
}

function exportVault() {
  const blob = loadEncryptedBlob();
  const file = new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = "carltons-loadies-vault-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

function wipeVault() {
  if (!confirm("Wipe vault permanently from this browser?")) return;
  localStorage.removeItem(VAULT_STORAGE_KEY);
  lock();
  $("output").textContent = "Vault wiped.";
}

$("unlockBtn").addEventListener("click", unlockOrCreate);
$("lockBtn").addEventListener("click", lock);
$("saveKeyBtn").addEventListener("click", saveApiKey);
$("riffBtn").addEventListener("click", riff);
$("saveBtn").addEventListener("click", saveSession);
$("acceptBtn").addEventListener("click", () => acceptReject(true));
$("rejectBtn").addEventListener("click", () => acceptReject(false));
$("exportBtn").addEventListener("click", exportVault);
$("wipeBtn").addEventListener("click", wipeVault);

// Enable accept/reject once unlocked
setUiUnlocked(false);
$("acceptBtn").disabled = false;
$("rejectBtn").disabled = false;
