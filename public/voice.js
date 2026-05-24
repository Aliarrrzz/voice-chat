// ─── VOICE MANAGER ───────────────────────────────────────────
const VoiceManager = {

  // ── sound effects ────────────────────────────────────────
  playSound(type) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const tones = type === 'join' ? [440, 660] : [660, 440];
      tones.forEach((f, i) => {
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f, ac.currentTime + i * 0.12);
        const env = ac.createGain();
        env.gain.setValueAtTime(0, ac.currentTime + i * 0.12);
        env.gain.linearRampToValueAtTime(0.18, ac.currentTime + i * 0.12 + 0.04);
        env.gain.linearRampToValueAtTime(0, ac.currentTime + i * 0.12 + 0.18);
        o.connect(env); env.connect(ac.destination);
        o.start(ac.currentTime + i * 0.12); o.stop(ac.currentTime + i * 0.12 + 0.2);
      });
      setTimeout(() => ac.close(), 800);
    } catch (e) { }
  },

  // ── join channel ─────────────────────────────────────────
  async joinChannel(ch, label) {
    if (State.currentChannel === ch) return;
    ['channel1', 'channel2', 'channel3'].forEach(c =>
      document.getElementById('btn-' + c).classList.remove('active'));
    document.getElementById('btn-' + ch).classList.add('active');
    State.currentChannel = ch;
    document.getElementById('hdrIcon').textContent = '🔊';
    document.getElementById('hdrName').textContent = label;
    document.getElementById('hdrDesc').textContent = 'Voice Channel';
    document.getElementById('vcChannelName').textContent = label + ' · AURA Server';
    PingManager.start(ch);
    document.getElementById('voiceControls').classList.add('show');
    this.playSound('join');

    if (!State.localStream) {
      try {
        State.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        State.micEnabled = true; State.videoEnabled = false;
        updateMicUI(); updateVideoUI();
        this.startVoiceDetection();
      } catch { showToast('🎤 Microphone access denied'); return; }
    }
    State.socket.emit('join', ch);
  },

  // ── disconnect ───────────────────────────────────────────
  disconnect() {
    this.playSound('leave');
    if (State.speakingInterval) { clearInterval(State.speakingInterval); State.speakingInterval = null; }
    if (State.audioContext) { State.audioContext.close(); State.audioContext = null; State.analyser = null; }
    State.isSpeaking = false;
    if (State.localStream) { State.localStream.getTracks().forEach(t => t.stop()); State.localStream = null; }
    if (State.screenStream) {
      State.screenStream.getTracks().forEach(t => t.stop()); State.screenStream = null;
      if (State.socket && State.currentChannel)
        State.socket.emit('screen-share-state', { channel: State.currentChannel, sharing: false });
    }
    if (State.videoEnabled && State.socket && State.currentChannel)
      State.socket.emit('video-state', { channel: State.currentChannel, videoEnabled: false });
    const lv = document.getElementById('local-video'); if (lv) lv.remove();
    const rv = document.getElementById('remote-videos'); if (rv) rv.remove();
    State.videoEnabled = false; updateVideoUI();

    Object.values(State.peerConnections).forEach(pc => pc.close());
    State.peerConnections = {};
    if (State.currentChannel && State.socket) State.socket.emit('leave', State.currentChannel);
    State.currentChannel = null;

    ['channel1', 'channel2', 'channel3'].forEach(c => {
      document.getElementById('btn-' + c).classList.remove('active');
      const el = document.getElementById('users-' + c); if (el) el.innerHTML = '';
    });
    document.getElementById('hdrIcon').textContent = '💬';
    document.getElementById('hdrName').textContent = 'general';
    document.getElementById('hdrDesc').textContent = 'General Channel';
    document.getElementById('voiceControls').classList.remove('show');
    document.getElementById('btn-screen').classList.remove('active');
    document.getElementById('vc-screen').classList.remove('active');
    document.getElementById('screenPreview').classList.remove('show');
    document.getElementById('screenPreviewBox').innerHTML = '';
    closeScreenViewer();
    PingManager.stop();
    document.getElementById('membersList').innerHTML = '<div class="members-empty">You haven\'t joined a channel yet</div>';
    State.micEnabled = true; updateMicUI();
    showToast('📵 Disconnected');
  },

  // ── mic / deafen ─────────────────────────────────────────
  toggleMic() {
    if (!State.localStream) return;
    const t = State.localStream.getAudioTracks()[0];
    State.micEnabled = !t.enabled; t.enabled = State.micEnabled;
    updateMicUI();
    if (State.socket && State.currentChannel)
      State.socket.emit('mute-state', { channel: State.currentChannel, muted: !State.micEnabled, deafened: State.deafened });
    if (!State.userStates[State.clientId]) State.userStates[State.clientId] = {};
    State.userStates[State.clientId].muted = !State.micEnabled;
    updateUserStatusIcons(State.clientId);
    showToast(State.micEnabled ? '🎤 Mic on' : '🔇 Mic off');
  },

  toggleDeafen() {
    State.deafened = !State.deafened;
    document.getElementById('btn-deafen').textContent = State.deafened ? '🔇' : '🔊';
    document.querySelectorAll('audio').forEach(a => a.muted = State.deafened);
    if (State.socket && State.currentChannel)
      State.socket.emit('mute-state', { channel: State.currentChannel, muted: !State.micEnabled, deafened: State.deafened });
    if (!State.userStates[State.clientId]) State.userStates[State.clientId] = {};
    State.userStates[State.clientId].deafened = State.deafened;
    updateUserStatusIcons(State.clientId);
    showToast(State.deafened ? '🔇 Deafened' : '🔊 Undeafened');
  },

  async toggleVideo() {
    if (!State.localStream) return;

    if (State.videoEnabled) {
      // خاموش کردن دوربین: track رو کاملاً stop کن
      State.localStream.getVideoTracks().forEach(t => { t.stop(); State.localStream.removeTrack(t); });
      State.videoEnabled = false;
      updateVideoUI();
      const v = document.getElementById('local-video'); if (v) v.remove();
      // به peer connections هم بگو
      Object.values(State.peerConnections).forEach(pc => {
        pc.getSenders().filter(s => s.track && s.track.kind === 'video').forEach(s => pc.removeTrack(s));
      });
      if (State.socket && State.currentChannel)
        State.socket.emit('video-state', { channel: State.currentChannel, videoEnabled: false });
      showToast('📹 Camera off');
    } else {
      // روشن کردن دوربین: stream جدید بگیر
      try {
        const vs = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
        const vt = vs.getVideoTracks()[0];
        State.localStream.addTrack(vt);
        State.videoEnabled = true;
        updateVideoUI();
        showLocalVideo(State.localStream);
        // به peer connections اضافه کن
        Object.values(State.peerConnections).forEach(pc => pc.addTrack(vt, State.localStream));
        if (State.socket && State.currentChannel)
          State.socket.emit('video-state', { channel: State.currentChannel, videoEnabled: true });
        showToast('📹 Camera on');
      } catch { showToast('📹 Camera access denied'); }
    }
  },

  // ── voice detection ──────────────────────────────────────
  startVoiceDetection() {
    if (State.audioContext) return;
    try {
      State.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      State.analyser = State.audioContext.createAnalyser();
      State.analyser.fftSize = 512; State.analyser.smoothingTimeConstant = 0.3;
      const source = State.audioContext.createMediaStreamSource(State.localStream);
      source.connect(State.analyser);
      const data = new Uint8Array(State.analyser.frequencyBinCount);
      State.speakingInterval = setInterval(() => {
        if (!State.micEnabled) {
          if (State.isSpeaking) { State.isSpeaking = false; this._emitSpeaking(false); } return;
        }
        State.analyser.getByteFrequencyData(data);
        const avg = data.slice(0, data.length / 2).reduce((a, b) => a + b, 0) / (data.length / 2);
        const nowSpeaking = avg > 18;
        if (nowSpeaking !== State.isSpeaking) {
          State.isSpeaking = nowSpeaking;
          this._emitSpeaking(State.isSpeaking);
          document.querySelectorAll('.member-row').forEach(row => {
            if (row.dataset.uid === State.clientId) row.querySelector('.member-av')?.classList.toggle('speaking', State.isSpeaking);
          });
          document.querySelectorAll('.ch-voice-user').forEach(el => {
            if (el.dataset.uid === State.clientId) el.classList.toggle('speaking-user', State.isSpeaking);
          });
        }
      }, 80);
    } catch (e) { console.warn('voice detection', e); }
  },

  _emitSpeaking(active) {
    if (State.socket && State.currentChannel)
      State.socket.emit('speaking', { channel: State.currentChannel, active });
  },

  // ── WebRTC ───────────────────────────────────────────────
  async createPC(userId, isInit) {
    if (State.peerConnections[userId]) return State.peerConnections[userId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    State.peerConnections[userId] = pc;
    if (State.localStream) State.localStream.getTracks().forEach(t => pc.addTrack(t, State.localStream));
    if (State.screenStream) State.screenStream.getTracks().forEach(t => pc.addTrack(t, State.screenStream));
    pc.onicecandidate = e => { if (e.candidate) State.socket.emit('ice', { to: userId, candidate: e.candidate }); };
    pc._screenStreamId = null; // track کردن stream id صفحه‌نمایش
    pc.ontrack = e => {
      if (e.track.kind === 'audio') {
        const a = document.createElement('audio'); a.srcObject = e.streams[0]; a.autoplay = true; a.style.display = 'none'; document.body.appendChild(a);
      }
      if (e.track.kind === 'video') {
        const label = e.track.label?.toLowerCase() || '';
        const isScreen = label.includes('screen') || label.includes('display') || label.includes('monitor') || label.includes('window');
        if (isScreen) {
          pc._screenStreamId = e.streams[0].id;
          if (!State.userStates[userId]) State.userStates[userId] = {};
          State.userStates[userId].screenStream = e.streams[0];
          showScreenInPreview(e.streams[0]);
        } else {
          if (!State.userStates[userId]) State.userStates[userId] = {};
          State.userStates[userId].videoStream = e.streams[0];
          // دکمه Watch رو نشون بده
          State.userStates[userId].videoEnabled = true;
          updateUserVideoIcons(userId);
          showRemoteVideo(userId, e.streams[0]);
          // وقتی track قطع شد، icon رو پاک کن
          e.track.onended = () => {
            if (State.userStates[userId]) {
              State.userStates[userId].videoEnabled = false;
              delete State.userStates[userId].videoStream;
            }
            updateUserVideoIcons(userId);
            const wrap = document.getElementById('remote-vid-wrap-' + userId);
            if (wrap) wrap.remove();
          };
        }
      }
    };
    if (isInit) {
      const off = await pc.createOffer();
      await pc.setLocalDescription(off);
      State.socket.emit('offer', { to: userId, offer: off });
    }
    return pc;
  },

  // ── screen share ─────────────────────────────────────────
  async shareScreen() {
    if (State.screenStream) {
      State.screenStream.getTracks().forEach(t => t.stop()); State.screenStream = null;
      document.getElementById('btn-screen').classList.remove('active');
      document.getElementById('vc-screen').classList.remove('active');
      document.getElementById('screenPreview').classList.remove('show');
      document.getElementById('screenPreviewBox').innerHTML = '';
      closeScreenViewer();
      if (State.socket && State.currentChannel)
        State.socket.emit('screen-share-state', { channel: State.currentChannel, sharing: false });
      if (!State.userStates[State.clientId]) State.userStates[State.clientId] = {};
      State.userStates[State.clientId].sharing = false;
      updateUserScreenIcons(State.clientId);
      showToast('🖥 Screen share stopped'); return;
    }
    try {
      State.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      document.getElementById('btn-screen').classList.add('active');
      document.getElementById('vc-screen').classList.add('active');
      showScreenInPreview(State.screenStream);
      openScreenViewer(State.screenStream, State.myName + ' (You)');
      if (State.socket && State.currentChannel)
        State.socket.emit('screen-share-state', { channel: State.currentChannel, sharing: true });
      if (!State.userStates[State.clientId]) State.userStates[State.clientId] = {};
      State.userStates[State.clientId].sharing = true;
      updateUserScreenIcons(State.clientId);
      State.screenStream.getTracks()[0].onended = () => {
        State.screenStream = null;
        document.getElementById('btn-screen').classList.remove('active');
        document.getElementById('vc-screen').classList.remove('active');
        document.getElementById('screenPreview').classList.remove('show');
        document.getElementById('screenPreviewBox').innerHTML = '';
        closeScreenViewer();
        if (State.socket && State.currentChannel)
          State.socket.emit('screen-share-state', { channel: State.currentChannel, sharing: false });
        if (!State.userStates[State.clientId]) State.userStates[State.clientId] = {};
        State.userStates[State.clientId].sharing = false;
        updateUserScreenIcons(State.clientId);
      };
      Object.values(State.peerConnections).forEach(pc =>
        State.screenStream.getTracks().forEach(t => pc.addTrack(t, State.screenStream)));
      showToast('🖥 Screen share started');
    } catch { showToast('Screen access denied'); }
  },

  watchUserVideo(uid, name) {
    const realName = name || State.userNameMap[uid]?.name || uid?.slice(0, 8) || '—';
    const storedStream = State.userStates[uid]?.videoStream;
    if (storedStream) { openScreenViewer(storedStream, realName + ' 📹'); return; }
    const pc = State.peerConnections[uid];
    if (pc) {
      const vr = pc.getReceivers().find(r => r.track && r.track.kind === 'video');
      if (vr) { openScreenViewer(new MediaStream([vr.track]), realName + ' 📹'); return; }
    }
    showToast('📹 No camera stream available');
  },

  watchUserScreen(uid, name) {
    const realName = name || State.userNameMap[uid]?.name || uid?.slice(0, 8) || '—';
    // اول از stream ذخیره شده در userStates استفاده کن
    const storedStream = State.userStates[uid]?.screenStream;
    if (storedStream) { openScreenViewer(storedStream, realName); return; }
    // fallback: از PC receivers بگیر
    const pc = State.peerConnections[uid];
    if (pc) {
      const vr = pc.getReceivers().find(r => r.track && r.track.kind === 'video');
      if (vr) { openScreenViewer(new MediaStream([vr.track]), realName); return; }
    }
    document.getElementById('svPresenterName').textContent = realName;
    document.getElementById('svNoStream').style.display = '';
    document.getElementById('screenViewer').classList.add('show');
    showToast('👁 Connecting to stream...');
  },
};

// ─── GLOBAL WRAPPERS (برای onclick های HTML) ─────────────────
function joinChannel(ch, label) { VoiceManager.joinChannel(ch, label); }
function disconnectCall() { VoiceManager.disconnect(); }
function toggleMic() { VoiceManager.toggleMic(); }
function toggleDeafen() { VoiceManager.toggleDeafen(); }
function toggleVideo() { VoiceManager.toggleVideo(); }
function shareScreen() { VoiceManager.shareScreen(); }