// ─── SOCKET MANAGER ──────────────────────────────────────────
const SocketManager = {
  init() {
    State.socket = io('http://localhost:3000', {
      transports: ['websocket'],
      auth: { token: localStorage.getItem('aura_token') || null },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    const s = State.socket;

    // ── connection ─────────────────────────────────────────
    s.on('connect', () => {
      State.clientId = s.id;
      s.emit('set-info', { name: State.myName, avatar: State.myAv });
      document.getElementById('panelStatus').textContent = 'Online';
      if (State.currentChannel) { s.emit('join', State.currentChannel); showToast('✅ Reconnected!'); }
    });

    s.on('disconnect', reason => {
      document.getElementById('panelStatus').textContent = 'Offline';
      if (reason !== 'io client disconnect') showToast('⚠️ Connection lost, reconnecting...');
    });

    s.on('reconnect_attempt', attempt => {
      document.getElementById('panelStatus').textContent = `Reconnecting (${attempt})...`;
    });

    s.on('reconnect_failed', () => {
      document.getElementById('panelStatus').textContent = 'Connection failed';
      showToast('❌ Could not reconnect. Please refresh.');
    });

    // ── channel sync ───────────────────────────────────────
    s.on('init-channels', snapshot => {
      Object.entries(snapshot).forEach(([ch, users]) => {
        users.forEach(u => { if (u.id && u.name) State.userNameMap[u.id] = { name: u.name, avatar: u.avatar }; });
        const el = document.getElementById('cnt-' + ch);
        if (el) el.textContent = users.length;
        renderSidebarUsers(ch, users);
      });
    });

    s.on('channel-users', users => {
      users.forEach(u => { if (u.id && u.name) State.userNameMap[u.id] = { name: u.name, avatar: u.avatar }; });
      renderMembers(users);
      renderSidebarUsers(State.currentChannel, users);
    });

    s.on('channel-count', ({ channel, count }) => {
      const el = document.getElementById('cnt-' + channel);
      if (el) el.textContent = count;
    });

    s.on('channel-sidebar', ({ channel, users }) => {
      users.forEach(u => { if (u.id && u.name) State.userNameMap[u.id] = { name: u.name, avatar: u.avatar }; });
      renderSidebarUsers(channel, users);
    });

    // ── users join/leave ───────────────────────────────────
    s.on('user-joined', async userId => {
      await VoiceManager.createPC(userId, true);
      VoiceManager.playSound('join');
      showToast('👤 User joined');
    });

    s.on('user-left', userId => {
      if (State.peerConnections[userId]) { State.peerConnections[userId].close(); delete State.peerConnections[userId]; }
      delete State.userStates[userId];
      const wrap = document.getElementById('remote-vid-wrap-' + userId);
      if (wrap) wrap.remove();
      const audioEl = document.getElementById('audio-' + userId);
      if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
      VoiceManager.playSound('leave');
      showToast('👤 User left');
    });

    // ── voice state ────────────────────────────────────────
    s.on('mute-state', ({ userId, muted, deafened: deaf }) => {
      if (!State.userStates[userId]) State.userStates[userId] = {};
      State.userStates[userId].muted = muted;
      State.userStates[userId].deafened = deaf;
      updateUserStatusIcons(userId);
    });

    s.on('video-state', ({ userId, videoEnabled }) => {
      if (!State.userStates[userId]) State.userStates[userId] = {};
      State.userStates[userId].videoEnabled = videoEnabled;
      updateUserVideoIcons(userId);
      if (!videoEnabled) {
        const wrap = document.getElementById('remote-vid-wrap-' + userId);
        if (wrap) wrap.remove();
      }
    });

    s.on('screen-share-state', ({ userId, sharing }) => {
      if (!State.userStates[userId]) State.userStates[userId] = {};
      State.userStates[userId].sharing = sharing;
      updateUserScreenIcons(userId);
      if (!sharing) {
        delete State.userStates[userId].screenStream;
        closeScreenViewer();
        if (!State.screenStream) {
          document.getElementById('screenPreview').classList.remove('show');
          document.getElementById('screenPreviewBox').innerHTML = '';
        }
      }
    });

    s.on('speaking', ({ userId, active }) => {
      document.querySelectorAll('.member-row').forEach(row => {
        if (row.dataset.uid === userId) row.querySelector('.member-av')?.classList.toggle('speaking', active);
      });
      document.querySelectorAll('.ch-voice-user').forEach(el => {
        if (el.dataset.uid === userId) el.classList.toggle('speaking-user', active);
      });
    });

    // ── WebRTC ─────────────────────────────────────────────
    s.on('offer', async ({ from, offer }) => {
      let pc = State.peerConnections[from];
      if (!pc) pc = await VoiceManager.createPC(from, false);
      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setLocalDescription({ type: 'rollback' });
        }
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
          console.warn('unexpected signalingState:', pc.signalingState, '— skipping offer from', from);
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        s.emit('answer', { to: from, answer: ans });
      } catch (e) {
        console.warn('offer handling error from', from, e);
      }
    });

    s.on('answer', async ({ from, answer }) => {
      const pc = State.peerConnections[from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    s.on('ice', async ({ from, candidate }) => {
      const pc = State.peerConnections[from];
      if (pc) try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { }
    });

    // ── chat ───────────────────────────────────────────────
    s.on('chat', data => {
      appendMsg(data.from, data.displayName || data.from.slice(0, 6), data.avatar || '👤', data.msg, data.from === State.clientId, null);
    });

    s.on('chat-history', messages => {
      const msgs = document.getElementById('chatMessages');
      document.getElementById('emptyChat')?.remove();
      messages.forEach(m => appendMsg(null, m.displayName, m.avatar, m.msg, false, new Date(m.timestamp)));
      msgs.scrollTop = msgs.scrollHeight;
    });

    s.on('pong', () => { });
  },
};