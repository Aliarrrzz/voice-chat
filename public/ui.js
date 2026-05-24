// ─── UI / RENDER ─────────────────────────────────────────────

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function pickAv(el) {
  document.querySelectorAll('.av-opt').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
  State.myAv = el.dataset.e;
}

function enterApp() {
  const n = document.getElementById('nameInput').value.trim();
  if (!n) { showToast('✏️ Enter a name!'); return; }
  State.myName = n;

  const panelAv = document.getElementById('panelAv');
  panelAv.innerHTML = State.myAv + '<div class="av-status-dot"></div>';
  document.getElementById('panelName').textContent = State.myName;
  document.getElementById('panelStatus').textContent = 'Online';

  const ls = document.getElementById('loginScreen');
  ls.style.opacity = '0'; ls.style.transition = 'opacity .3s';
  setTimeout(() => {
    ls.style.display = 'none';
    document.getElementById('app').classList.add('show');
    SocketManager.init();
  }, 300);
}

document.getElementById('nameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') enterApp();
});

// ─── Members panel ───────────────────────────────────────────
function renderMembers(users) {
  const list = document.getElementById('membersList');
  list.innerHTML = '';
  if (!users || users.length === 0) {
    list.innerHTML = '<div class="members-empty">No one is in the channel</div>';
    return;
  }
  const title = document.createElement('div');
  title.className = 'member-section-title';
  title.textContent = 'In Channel — ' + users.length;
  list.appendChild(title);

  users.forEach(u => {
    const uid = u.id || u;
    const isMe = uid === State.clientId;
    const name = isMe ? State.myName : (u.name || uid?.slice(0, 8) || '???');
    const av = isMe ? State.myAv : (u.avatar || '👤');
    const row = document.createElement('div');
    row.className = 'member-row';
    row.dataset.uid = uid;
    row.innerHTML = `
      <div class="member-av">${av}<div class="member-status-dot"></div></div>
      <div class="member-info">
        <div class="member-name">${esc(name)}${isMe ? '<span class="member-you">you</span>' : ''}</div>
      </div>`;
    list.appendChild(row);
    const state = State.userStates[uid] || {};
    if (state.muted || state.deafened) updateUserStatusIcons(uid);
    if (state.sharing) updateUserScreenIcons(uid);
  });
  if (State.currentChannel) renderSidebarUsers(State.currentChannel, users);
}

function renderSidebarUsers(channel, users) {
  const container = document.getElementById('users-' + channel);
  if (!container) return;
  container.innerHTML = '';
  if (!users || users.length === 0) return;

  users.forEach(u => {
    const uid = u.id || u;
    const isMe = uid === State.clientId;
    const name = isMe ? State.myName : (u.name || uid?.slice(0, 8) || '???');
    const av = isMe ? State.myAv : (u.avatar || '👤');
    const div = document.createElement('div');
    div.className = 'ch-voice-user';
    div.dataset.uid = uid;
    div.innerHTML = `<span class="ch-voice-user-av">${av}</span><span class="ch-voice-user-name">${esc(name)}${isMe ? ' (you)' : ''}</span>`;
    container.appendChild(div);

    const state = State.userStates[uid] || {};
    if (state.muted || state.deafened) {
      const ic = document.createElement('div'); ic.className = 'ch-voice-user-icons';
      const s = document.createElement('span'); s.className = 'ch-vc-icon'; s.textContent = '🔇';
      ic.appendChild(s); div.appendChild(ic);
    }
    if (state.sharing) {
      const wb = document.createElement('button'); wb.className = 'watch-btn'; wb.innerHTML = '🖥 Watch';
      wb.onclick = e => { e.stopPropagation(); VoiceManager.watchUserScreen(uid, name); };
      div.appendChild(wb);
    }
  });
}

// ─── Status icons ─────────────────────────────────────────────
function updateUserStatusIcons(uid) {
  const state = State.userStates[uid] || {};
  const isMuted = state.muted || false;
  const isDeaf = state.deafened || false;

  document.querySelectorAll('.member-row').forEach(row => {
    if (row.dataset.uid !== uid) return;
    let icons = row.querySelector('.member-icons');
    if (!icons) { icons = document.createElement('div'); icons.className = 'member-icons'; row.appendChild(icons); }
    icons.innerHTML = '';
    if (isDeaf) {
      const d = document.createElement('div'); d.className = 'status-icon deafened'; d.title = 'Deafened'; d.textContent = '🔇'; icons.appendChild(d);
    } else if (isMuted) {
      const m = document.createElement('div'); m.className = 'status-icon muted'; m.title = 'Muted'; m.textContent = '🔇'; icons.appendChild(m);
    }
  });

  document.querySelectorAll('.ch-voice-user').forEach(el => {
    if (el.dataset.uid !== uid) return;
    let ic = el.querySelector('.ch-voice-user-icons');
    if (!ic) { ic = document.createElement('div'); ic.className = 'ch-voice-user-icons'; el.appendChild(ic); }
    ic.innerHTML = '';
    if (isDeaf || isMuted) {
      const s = document.createElement('span'); s.className = 'ch-vc-icon'; s.textContent = '🔇'; ic.appendChild(s);
    }
  });
}

function updateUserScreenIcons(uid) {
  const state = State.userStates[uid] || {};
  const isSharing = state.sharing || false;

  document.querySelectorAll('.ch-voice-user').forEach(el => {
    if (el.dataset.uid !== uid) return;
    let wb = el.querySelector('.watch-btn');
    if (isSharing) {
      if (!wb) {
        wb = document.createElement('button'); wb.className = 'watch-btn'; wb.innerHTML = '🖥 Watch';
        wb.onclick = e => { e.stopPropagation(); VoiceManager.watchUserScreen(uid, uid?.slice(0, 8)); };
        el.appendChild(wb);
      }
    } else { if (wb) wb.remove(); }
  });

  document.querySelectorAll('.member-row').forEach(row => {
    if (row.dataset.uid !== uid) return;
    let badge = row.querySelector('.member-screen-badge');
    if (isSharing) {
      if (!badge) {
        badge = document.createElement('span'); badge.className = 'member-screen-badge';
        badge.innerHTML = '🖥 Sharing'; badge.title = 'Click to watch';
        badge.onclick = () => VoiceManager.watchUserScreen(uid, State.userNameMap[uid]?.name || uid?.slice(0, 8));
        const icons = row.querySelector('.member-icons');
        if (icons) icons.before(badge); else row.appendChild(badge);
      }
    } else { if (badge) badge.remove(); }
  });
}

function updateUserVideoIcons(uid) {
  const state = State.userStates[uid] || {};
  const hasVideo = state.videoEnabled || false;
  const isMe = uid === State.clientId;

  document.querySelectorAll('.ch-voice-user').forEach(el => {
    if (el.dataset.uid !== uid) return;
    let wb = el.querySelector('.watch-cam-btn');
    if (hasVideo && !isMe) {
      if (!wb) {
        wb = document.createElement('button'); wb.className = 'watch-btn watch-cam-btn'; wb.innerHTML = '📹 Watch';
        wb.onclick = e => { e.stopPropagation(); VoiceManager.watchUserVideo(uid, State.userNameMap[uid]?.name || uid?.slice(0, 8)); };
        el.appendChild(wb);
      }
    } else { if (wb) wb.remove(); }
  });

  document.querySelectorAll('.member-row').forEach(row => {
    if (row.dataset.uid !== uid) return;
    let badge = row.querySelector('.member-cam-badge');
    if (hasVideo && !isMe) {
      if (!badge) {
        badge = document.createElement('span'); badge.className = 'member-screen-badge member-cam-badge';
        badge.innerHTML = '📹 Camera'; badge.title = 'Click to watch';
        badge.onclick = () => VoiceManager.watchUserVideo(uid, State.userNameMap[uid]?.name || uid?.slice(0, 8));
        const icons = row.querySelector('.member-icons');
        if (icons) icons.before(badge); else row.appendChild(badge);
      }
    } else { if (badge) badge.remove(); }
  });
}

// ─── Chat ─────────────────────────────────────────────────────
function appendMsg(fromId, name, av, text, isMe, dateObj) {
  const msgs = document.getElementById('chatMessages');
  document.getElementById('emptyChat')?.remove();
  const div = document.createElement('div');
  div.className = 'msg-group' + (isMe ? ' msg-mine' : '');
  const t = dateObj || new Date();
  const time = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0');
  div.innerHTML = `<div class="msg-av">${av}</div><div class="msg-body"><div class="msg-meta"><span class="msg-author">${esc(isMe ? State.myName : name)}</span><span class="msg-time">Today ${time}</span></div><div class="msg-text">${esc(text)}</div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendMsg() {
  const inp = document.getElementById('msgInput');
  const text = inp.value.trim();
  if (!text) return;
  if (!State.currentChannel) { showToast('⚠️ Join a voice channel first'); return; }
  State.socket.emit('chat', { channel: State.currentChannel, msg: text, displayName: State.myName, avatar: State.myAv });
  inp.value = '';
}

// ─── Video ────────────────────────────────────────────────────
function showLocalVideo(stream) {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;
  let v = document.getElementById('local-video');
  if (!v) {
    v = document.createElement('video');
    v.id = 'local-video'; v.autoplay = true; v.muted = true; v.playsInline = true;
    v.style.cssText = 'width:120px;height:90px;border-radius:10px;object-fit:cover;border:2px solid var(--accent);position:fixed;bottom:90px;right:16px;z-index:100;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    document.body.appendChild(v);
  }
  v.srcObject = stream; v.style.display = 'block';
}

function showRemoteVideo(uid, stream) {
  let container = document.getElementById('remote-videos');
  if (!container) {
    container = document.createElement('div'); container.id = 'remote-videos';
    container.style.cssText = 'position:fixed;bottom:90px;right:150px;display:flex;gap:8px;z-index:100;flex-wrap:wrap;max-width:400px;justify-content:flex-end;';
    document.body.appendChild(container);
  }
  if (document.getElementById('remote-vid-wrap-' + uid)) return;
  const wrap = document.createElement('div'); wrap.id = 'remote-vid-wrap-' + uid; wrap.style.cssText = 'position:relative;';
  const vid = document.createElement('video'); vid.id = 'remote-vid-' + uid; vid.autoplay = true; vid.playsInline = true;
  vid.style.cssText = 'width:120px;height:90px;border-radius:10px;object-fit:cover;border:2px solid var(--bg4);box-shadow:0 4px 20px rgba(0,0,0,0.5);';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'position:absolute;bottom:4px;left:4px;font-size:10px;color:#fff;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
  lbl.textContent = State.userNameMap[uid]?.name || uid.slice(0, 6);
  wrap.appendChild(vid); wrap.appendChild(lbl); container.appendChild(wrap);
  vid.srcObject = stream;
}

function updateVideoUI() {
  const btn = document.getElementById('btn-video');
  if (btn) btn.classList.toggle('active', State.videoEnabled);
}

function updateMicUI() {
  document.getElementById('btn-mic').textContent = State.micEnabled ? '🎤' : '🔇';
  document.getElementById('btn-mic').classList.toggle('danger', !State.micEnabled);
}

// ─── Screen viewer ────────────────────────────────────────────
function openScreenViewer(stream, presenterName) {
  document.getElementById('svPresenterName').textContent = presenterName || '—';
  const area = document.getElementById('svVideoArea');
  area.querySelectorAll('video').forEach(v => v.remove());
  document.getElementById('svNoStream').style.display = 'none';
  const video = document.createElement('video');
  video.srcObject = stream; video.autoplay = true; video.playsInline = true;
  video.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;';
  area.appendChild(video);
  document.getElementById('screenViewer').classList.add('show');
}

function closeScreenViewer() {
  document.getElementById('svVideoArea').querySelectorAll('video').forEach(v => v.remove());
  document.getElementById('svNoStream').style.display = '';
  document.getElementById('screenViewer').classList.remove('show');
}

function showScreenInPreview(stream) {
  const box = document.getElementById('screenPreviewBox');
  box.querySelectorAll('video').forEach(v => v.remove());
  const video = document.createElement('video');
  video.srcObject = stream; video.autoplay = true; video.playsInline = true;
  box.appendChild(video);
  document.getElementById('screenPreview').classList.add('show');
}