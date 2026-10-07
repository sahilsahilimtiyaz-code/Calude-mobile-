// Claude Luxe — mobile port of unlimited-claude, 100% feature parity + luxury mobile UX
const availableModels = [
  { apiName: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', shortName: 'Sonnet 4', desc: 'Balanced brilliance • daily luxury', icon: '✦' },
  { apiName: 'claude-opus-4', displayName: 'Claude Opus 4', shortName: 'Opus 4', desc: 'Most powerful • deepest reasoning', icon: '👑' },
  { apiName: 'claude-3-7-sonnet', displayName: 'Claude 3.7 Sonnet', shortName: 'Sonnet 3.7', desc: 'Fast & efficient • classic craft', icon: '⚡' },
];
let currentModel = localStorage.getItem('luxe-model') || availableModels[0].apiName;
let chatHistory = [];
let isStreaming = false;
let recentConversations = [];
let currentConversationId = null;
let researchMode = false;
let activeTab = 'chats';
let deferredPrompt = null;
let currentArt = { code: '', lang: 'text' };

try { recentConversations = JSON.parse(localStorage.getItem('luxe-chats') || '[]'); } catch { recentConversations = []; }
function persist() {
  try {
    localStorage.setItem('luxe-chats', JSON.stringify(recentConversations.slice(0, 20)));
    localStorage.setItem('luxe-model', currentModel);
  } catch {}
}

const $ = (id) => document.getElementById(id);
function extractText(r) {
  try {
    if (!r) return '';
    if (typeof r === 'string') return r;
    if (typeof r.text === 'string' && r.text) return r.text;
    const mc = r.message?.content;
    if (typeof mc === 'string') return mc;
    if (Array.isArray(mc)) return mc.map(p => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n');
    if (mc?.text) return mc.text;
    if (typeof r.content === 'string') return r.content;
    if (typeof r.output_text === 'string') return r.output_text;
  } catch {}
  return '';
}
function toast(msg, ms = 2400) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function buzz(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }

// ---------- greeting ----------
function initGreeting() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('greetingText').textContent = `${part}, Hassan`;
  $('dateLine').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

// ---------- protocol / auth (parity with Claude.html) ----------
function updateProtocolNotice() {
  const el = $('protocolNotice'), mini = $('protocolNoticeMini');
  let msg = '', color = '';
  if (window.location.protocol === 'file:') { msg = '✅ File mode: auth should work perfectly.'; color = '#22c55e'; }
  else if (['localhost', '127.0.0.1'].includes(location.hostname)) { msg = '⚠️ Server mode: allow popups for Puter auth.'; color = '#f59e0b'; }
  else { msg = '🌐 Web mode: allow popups for this domain.'; color = '#7aa2ff'; }
  if (el) { el.innerHTML = msg; el.style.color = color; }
  if (mini) mini.textContent = msg.replace(/^[✅⚠️🌐 ]+/, '');
  if (localStorage.getItem('luxe-authed') === '1') {
    const b = $('authButton'); if (b) { b.textContent = '✅ Authenticated'; b.disabled = true; }
    $('authStatus').textContent = 'Authenticated ✓';
  }
}
async function handleManualAuth() {
  const btn = $('authButton');
  try {
    if (btn) { btn.textContent = '🔄 Authenticating…'; btn.disabled = true; }
    if (typeof puter === 'undefined') throw new Error('Puter.js not loaded. Check connection.');
    const r = await puter.ai.chat('test', { model: 'claude-sonnet-4' });
    if (r && (r.message?.content || r.success !== false || r.text || typeof r === 'string')) {
      localStorage.setItem('luxe-authed', '1');
      if (btn) btn.textContent = '✅ Authenticated';
      $('authStatus').textContent = 'Authenticated ✓';
      toast('Authenticated — luxury unlocked ✦');
      setTimeout(() => { const c = $('authCard'); if (c) c.style.display = 'none'; closeSheet('help'); }, 1600);
    } else throw new Error('Auth response failed.');
  } catch (e) {
    console.error('auth fail', e);
    if (btn) { btn.textContent = '❌ Auth Failed — Try Guide'; btn.disabled = false; }
    openSheet('help');
  }
}

// ---------- models ----------
function updateModelDisplay() {
  const m = availableModels.find(x => x.apiName === currentModel) || availableModels[0];
  $('currentModel').textContent = m.displayName;
  $('chatCurrentModel').textContent = m.shortName;
  $('chatCurrentModelTop').textContent = m.shortName;
  document.querySelectorAll('.model-opt').forEach(b => b.classList.toggle('active', b.dataset.model === currentModel));
  persist();
}
function renderModelSheet() {
  $('modelList').innerHTML = '';
  availableModels.forEach(m => {
    const b = document.createElement('button');
    b.className = 'model-opt' + (m.apiName === currentModel ? ' active' : '');
    b.dataset.model = m.apiName;
    b.innerHTML = `<span class="m-ico">${m.icon}</span><span><b>${m.displayName}</b><i>${m.desc}</i></span>`;
    b.onclick = () => { currentModel = m.apiName; updateModelDisplay(); closeSheet('model'); toast(`Switched to ${m.displayName}`); buzz(); console.log('🔄 Model switched to:', m.displayName); };
    $('modelList').appendChild(b);
  });
}

// ---------- sheets / drawer ----------
function openSheet(n) { $(n + 'Scrim').classList.add('show'); $(n === 'model' ? 'modelSheet' : n === 'art' ? 'artSheet' : 'helpSheet').classList.add('show'); }
function closeSheet(n) { $(n + 'Scrim').classList.remove('show'); $(n === 'model' ? 'modelSheet' : n === 'art' ? 'artSheet' : 'helpSheet').classList.remove('show'); }
function openDrawer() { $('drawer').classList.add('open'); $('scrim').classList.add('show'); }
function closeDrawer() { $('drawer').classList.remove('open'); $('scrim').classList.remove('show'); }

// ---------- conversations (parity + localStorage fix) ----------
function collectArtifacts() {
  const out = [];
  recentConversations.forEach(c => (c.messages || []).forEach(m => {
    if (m.role !== 'assistant') return;
    const re = /```(\w*)\n([\s\S]*?)```/g; let x;
    while ((x = re.exec(m.content || ''))) out.push({ conv: c.title, lang: x[1] || 'text', code: x[2].trim() });
  }));
  return out;
}
function updateRecentItems() {
  const box = $('recentItems'); box.innerHTML = '';
  if (activeTab === 'artifacts') {
    const arts = collectArtifacts();
    $('artifactCount').textContent = arts.length;
    if (!arts.length) { box.innerHTML = '<div class="empty-hint">No artifacts yet — ask Claude to write code.</div>'; return; }
    arts.slice(0, 30).forEach((a, i) => {
      const d = document.createElement('div'); d.className = 'recent-item';
      d.innerHTML = `<span>◈ ${a.lang} • ${(a.conv || '').slice(0, 32)}</span>`;
      d.onclick = () => openArtifact(a.code, a.lang);
      box.appendChild(d);
    });
    return;
  }
  if (activeTab === 'projects') {
    box.innerHTML = '<div class="empty-hint">Projects are curated chats.<br>Long-press a chat to feature it soon.</div>';
    return;
  }
  $('artifactCount').textContent = collectArtifacts().length;
  if (!recentConversations.length) {
    box.innerHTML = '<div class="empty-hint">No recent conversations</div>'; return;
  }
  recentConversations.forEach(c => {
    const d = document.createElement('div');
    d.className = 'recent-item' + (c.id === currentConversationId ? ' active' : '');
    const s = document.createElement('span'); s.textContent = c.title; d.appendChild(s);
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×'; del.setAttribute('aria-label', 'Delete');
    del.onclick = (e) => { e.stopPropagation(); recentConversations = recentConversations.filter(x => x.id !== c.id); if (currentConversationId === c.id) startNewChat(); persist(); updateRecentItems(); toast('Conversation deleted'); };
    d.appendChild(del);
    d.onclick = () => { loadConversation(c.id); closeDrawer(); };
    box.appendChild(d);
  });
}
function createNewConversation(firstMessage) {
  currentConversationId = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + '…' : firstMessage;
  recentConversations.unshift({ id: currentConversationId, title, messages: [], timestamp: Date.now(), model: currentModel });
  recentConversations = recentConversations.slice(0, 20);
  persist(); updateRecentItems();
  console.log('📝 Created conversation:', title);
}
function updateCurrentConversation() {
  if (!currentConversationId) return;
  const c = recentConversations.find(x => x.id === currentConversationId);
  if (c) {
    c.messages = [...chatHistory]; c.timestamp = Date.now();
    const i = recentConversations.indexOf(c);
    if (i > 0) { recentConversations.splice(i, 1); recentConversations.unshift(c); }
    persist(); updateRecentItems();
  }
}
function loadConversation(id) {
  const c = recentConversations.find(x => x.id === id); if (!c) return;
  currentConversationId = id; chatHistory = [...(c.messages || [])];
  currentModel = c.model || availableModels[0].apiName; updateModelDisplay();
  switchToChatView();
  $('chatMessages').innerHTML = '';
  chatHistory.forEach(m => addMessage(m.content, m.role));
  try { const ci = $('chatInput'); if (ci && matchMedia('(pointer:fine)').matches) ci.focus(); } catch {}
}
function switchToChatView() {
  $('welcomeScreen').style.display = 'none';
  $('chatContainer').classList.add('active');
}
function startNewChat() {
  chatHistory = []; currentConversationId = null;
  currentModel = availableModels[0].apiName; updateModelDisplay();
  $('welcomeScreen').style.display = 'flex';
  $('chatContainer').classList.remove('active');
  $('chatMessages').innerHTML = '';
  const w = $('welcomeInput'); if (w) { w.value = ''; autoResize(w); }
  updateRecentItems();
}

// ---------- messaging + streaming (parity) ----------
async function handleWelcomeMessage() {
  const inp = $('welcomeInput'); let msg = inp.value.trim();
  if (!msg || isStreaming) return;
  if (researchMode) msg = `Research thoroughly and cite key points:\n${msg}`;
  buzz(); createNewConversation(msg); switchToChatView(); inp.value = ''; autoResize(inp);
  await sendMessage(msg);
}
async function handleChatMessage() {
  const inp = $('chatInput'); let msg = inp.value.trim();
  if (!msg || isStreaming) return;
  if (researchMode) msg = `Research thoroughly:\n${msg}`;
  inp.value = ''; autoResize(inp); buzz();
  await sendMessage(msg);
}
async function sendMessage(message) {
  if (isStreaming) return;
  addMessage(message, 'user'); showTyping(true); setInputState(false);
  chatHistory.push({ role: 'user', content: message });
  let placeholder = null;
  try {
    isStreaming = true;
    if (typeof puter === 'undefined') throw new Error('Puter.js unavailable. Check connection.');
    const response = await puter.ai.chat(chatHistory, { model: currentModel, stream: true });
    if (response && response.success === false) throw new Error('Auth required — tap Authenticate and allow popup.');
    placeholder = addMessage('', 'assistant');
    showTyping(false);
    let full = '';
    let gotChunk = false;
    try {
      for await (const part of response) {
        if (part?.text) { full += part.text; gotChunk = true; renderFormattedMessage(full, placeholder.body, true); scrollToBottom(); }
      }
    } catch (iterErr) {
      // some SDKs throw on stream end — fall through to object parsing
      console.warn('stream iter ended', iterErr);
    }
    if (!gotChunk) {
      const fb = extractText(response);
      if (fb) full = fb;
    }
    isStreaming = false;
    if (!String(full || '').trim()) {
      try { placeholder.wrap.remove(); } catch {}
      placeholder = null;
      throw new Error('Empty response. Allow popups / re-authenticate, then try again.');
    }
    renderFormattedMessage(full, placeholder.body, false);
    attachMsgActions(placeholder.wrap, placeholder.body);
    chatHistory.push({ role: 'assistant', content: full });
    updateCurrentConversation();
  } catch (e) {
    console.error('send fail', e);
    isStreaming = false;
    showTyping(false);
    try { if (placeholder && placeholder.wrap && !placeholder.body.textContent.trim()) placeholder.wrap.remove(); } catch {}
    addMessage('Sorry, I encountered an error: ' + (e.message || 'Unknown'), 'assistant', true);
    if (chatHistory.length && chatHistory[chatHistory.length - 1].role === 'user') chatHistory.pop();
  } finally { isStreaming = false; setInputState(true); const ci = $('chatInput'); if (ci && document.activeElement !== ci) { /* keep keyboard down on mobile */ } }
}
function addMessage(content, role, isError = false) {
  const box = $('chatMessages');
  const wrap = document.createElement('div'); wrap.className = `message ${role}`;
  const av = document.createElement('div'); av.className = 'm-avatar'; av.textContent = role === 'user' ? 'H' : '✦';
  const body = document.createElement('div'); body.className = 'm-body' + (isError ? ' error' : '');
  if (role === 'assistant') renderFormattedMessage(content, body, false); else body.textContent = content;
  wrap.appendChild(av); wrap.appendChild(body); box.appendChild(wrap);
  if (role === 'assistant' && !isError && content) attachMsgActions(wrap, body);
  scrollToBottom();
  return { body, wrap };
}
function renderFormattedMessage(content, container, showCaret) {
  const caret = typeof showCaret === 'boolean' ? showCaret : isStreaming;
  container.innerHTML = '';
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(content || ''))) {
    if (m.index > last) { const d = document.createElement('div'); d.className = 'm-text'; d.textContent = content.slice(last, m.index); container.appendChild(d); }
    container.appendChild(createArtifactCanvas(m[2].trim(), m[1] || 'text'));
    last = m.index + m[0].length;
  }
  const rest = (content || '').slice(last);
  if (rest) { const d = document.createElement('div'); d.className = 'm-text'; d.textContent = rest; if (caret) { const c = document.createElement('span'); c.className = 'stream-caret'; d.appendChild(c); } container.appendChild(d); }
  if (!container.children.length && content) { const d = document.createElement('div'); d.className = 'm-text'; d.textContent = content; container.appendChild(d); }
}
function createArtifactCanvas(code, lang) {
  const el = document.createElement('div'); el.className = 'artifact';
  el.innerHTML = `<div class="artifact-head"><span class="artifact-title">${lang} artifact</span><span class="artifact-btns"></span></div><pre><code></code></pre>`;
  el.querySelector('code').textContent = code.length > 900 ? code.slice(0, 900) + '\n… (tap View for full)' : code;
  const btns = el.querySelector('.artifact-btns');
  const mk = (t, cls, fn) => { const b = document.createElement('button'); b.className = 'artifact-btn ' + (cls || ''); b.textContent = t; b.onclick = (e) => { e.stopPropagation(); fn(); }; btns.appendChild(b); };
  mk('Copy', '', () => navigator.clipboard.writeText(code).then(() => toast('Copied ✦')));
  mk('Save', '', () => downloadCode(code, lang));
  if (lang.toLowerCase() === 'html') mk('View', 'view', () => openArtifact(code, lang)); else mk('View', '', () => openArtifact(code, lang));
  el.onclick = () => openArtifact(code, lang);
  return el;
}
function downloadCode(code, lang) {
  const map = { javascript: 'js', python: 'py', html: 'html', css: 'css', json: 'json', java: 'java', csharp: 'cs', cpp: 'cpp', ruby: 'rb', go: 'go', rust: 'rs', shell: 'sh', bash: 'sh' };
  const ext = map[String(lang).toLowerCase()] || 'txt';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
  a.download = `claude-code.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Artifact saved');
}
function attachMsgActions(wrap, body) {
  try {
    if (!wrap || wrap.querySelector('.msg-actions')) return;
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'msg-act'; copy.textContent = '⧉ Copy';
    copy.onclick = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(body.innerText || '').then(() => toast('Copied ✦')).catch(() => toast('Copy failed')); };
    const speak = document.createElement('button');
    speak.type = 'button'; speak.className = 'msg-act'; speak.textContent = '♪ Speak';
    speak.onclick = (e) => {
      e.stopPropagation();
      try {
        if (!('speechSynthesis' in window)) { toast('Speech not supported'); return; }
        speechSynthesis.cancel();
        const t = (body.innerText || '').slice(0, 800);
        if (!t.trim()) return;
        speechSynthesis.speak(new SpeechSynthesisUtterance(t));
        toast('Speaking… tap again to stop');
        speak.onclick = (ev) => { ev.stopPropagation(); try { speechSynthesis.cancel(); } catch {} toast('Stopped'); attachMsgActionsRefresh(wrap, body); };
      } catch { toast('Speech failed'); }
    };
    bar.appendChild(copy); bar.appendChild(speak);
    body.appendChild(bar);
  } catch {}
}
function attachMsgActionsRefresh(wrap, body) {
  try { const old = wrap.querySelector('.msg-actions'); if (old) old.remove(); } catch {}
  attachMsgActions(wrap, body);
}
function openArtifact(code, lang) {
  currentArt = { code: code || '', lang: lang || 'text' };
  $('artTitle').textContent = `${currentArt.lang} artifact`;
  $('artCode').textContent = currentArt.code;
  const isHtml = String(currentArt.lang).toLowerCase() === 'html';
  $('artHtmlWrap').hidden = !isHtml;
  try {
    if (isHtml) { $('artFrame').srcdoc = currentArt.code; }
    else { $('artFrame').removeAttribute('srcdoc'); $('artFrame').src = 'about:blank'; }
  } catch {}
  openSheet('art');
}
function showTyping(on) { $('typingIndicator').classList.toggle('show', !!on); if (on) scrollToBottom(); }
function setInputState(en) {
  ['welcomeInput', 'chatInput', 'sendBtn', 'chatSendBtn'].forEach(id => {
    const el = $(id); if (el) { el.disabled = !en; el.style.opacity = en ? '1' : '.55'; }
  });
}
function scrollToBottom() {
  const c = $('chatMessages'); if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}
function autoResize(t) { if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 150) + 'px'; }

// ---------- init ----------
document.addEventListener('DOMContentLoaded', () => {
  initGreeting(); updateProtocolNotice(); renderModelSheet(); updateModelDisplay(); updateRecentItems();
  if (localStorage.getItem('luxe-authed') === '1' && $('authCard')) $('authCard').style.display = 'none';
  if (matchMedia('(display-mode: standalone)').matches) $('pwaHint').hidden = true; else $('pwaHint').hidden = false;
  const themeBtn = $('themeSwitch');
  if (localStorage.getItem('luxe-theme') === 'light') { document.body.classList.add('light'); themeBtn?.classList.remove('on'); }
  else { document.body.classList.remove('light'); themeBtn?.classList.add('on'); }

  $('authButton').onclick = handleManualAuth;
  $('helpAuthBtn').onclick = handleManualAuth;
  $('troubleBtn').onclick = () => openSheet('help');
  ['modelScrim', 'artScrim', 'helpScrim'].forEach(id => $(id).onclick = () => { closeSheet('model'); closeSheet('art'); closeSheet('help'); });
  $('modelSelector').onclick = () => { renderModelSheet(); openSheet('model'); };
  $('modelPill').onclick = () => { renderModelSheet(); openSheet('model'); };
  $('chatModelSelector').onclick = () => { renderModelSheet(); openSheet('model'); };
  $('menuBtn').onclick = openDrawer; $('closeDrawerBtn').onclick = closeDrawer; $('scrim').onclick = closeDrawer;
  $('newChatBtn').onclick = () => { startNewChat(); closeDrawer(); };
  $('newChatTopBtn').onclick = () => { startNewChat(); toast('New atelier started ✦'); };
  $('sendBtn').onclick = handleWelcomeMessage; $('chatSendBtn').onclick = handleChatMessage;
  $('researchBtn').onclick = () => { researchMode = !researchMode; $('researchBtn').setAttribute('aria-pressed', researchMode); toast(researchMode ? 'Research mode on ✧' : 'Research mode off'); };
  $('themeSwitch').onclick = () => {
    const sw = $('themeSwitch');
    const light = document.body.classList.toggle('light');
    sw?.classList.toggle('on', !light);
    try { localStorage.setItem('luxe-theme', light ? 'light' : 'dark'); } catch {}
  };
  $('userInfoBtn').onclick = () => { closeDrawer(); $('authCard').style.display = 'block'; toast('Hassan • Pro plan'); };
  document.querySelectorAll('.drawer-nav .nav-item').forEach(b => b.onclick = () => {
    document.querySelectorAll('.drawer-nav .nav-item').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; updateRecentItems();
  });
  document.querySelectorAll('.quick').forEach(b => b.onclick = () => {
    const p = b.dataset.prompt; const w = $('welcomeInput');
    w.value = p + ' '; w.focus(); autoResize(w); buzz();
  });
  [['welcomeInput', 'sendBtn', handleWelcomeMessage], ['chatInput', 'chatSendBtn', handleChatMessage]].forEach(([id, btnId, fn]) => {
    const t = $(id);
    const upd = () => { autoResize(t); const b = $(btnId); if (b) b.classList.toggle('ready', t.value.trim().length > 0); };
    t.addEventListener('input', upd); upd();
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fn(); } });
  });
  $('artCopy').onclick = () => { try { navigator.clipboard.writeText(currentArt.code).then(() => toast('Copied ✦')); } catch { toast('Copy failed'); } };
  $('artDownload').onclick = () => downloadCode(currentArt.code, currentArt.lang);
  $('artOpen').onclick = () => {
    if (String(currentArt.lang).toLowerCase() === 'html') { $('artHtmlWrap').hidden = false; try { $('artFrame').srcdoc = currentArt.code; } catch {} }
    else {
      try {
        const blob = new Blob([currentArt.code], { type: 'text/plain' });
        window.open(URL.createObjectURL(blob), '_blank');
      } catch { toast('Open failed — use Copy'); }
    }
  };
  // swipe to close drawer
  let sx = 0;
  $('drawer').addEventListener('touchstart', (e) => sx = e.touches[0].clientX, { passive: true });
  $('drawer').addEventListener('touchend', (e) => { if (sx - e.changedTouches[0].clientX > 70) closeDrawer(); }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); closeSheet('model'); closeSheet('art'); closeSheet('help'); }
  });
  // luxury press ripple + orb parallax (subtle, GPU cheap)
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.quick,.send-luxe,.auth-btn,.model-opt,.icon-btn,.new-chat-luxe');
    if (b) { b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 350); }
  }, { passive: true });
  try {
    const orbs = () => document.querySelectorAll('.orb');
    let raf = 0;
    document.addEventListener('pointermove', (e) => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / innerWidth - 0.5) * 18, y = (e.clientY / innerHeight - 0.5) * 18;
        orbs().forEach((o, i) => { o.style.translate = `${x * (i ? -1 : 1)}px ${y * (i ? -1 : 1)}px`; });
      });
    }, { passive: true });
  } catch {}
  // keyboard comfort
  if (window.visualViewport) visualViewport.addEventListener('resize', () => scrollToBottom());
  // PWA
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('pwaHint').hidden = false; });
  $('pwaBtn').onclick = async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; $('pwaHint').hidden = true; } else toast('Use browser menu → Install app'); };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  console.log('✅ Claude Luxe initialized');
});
