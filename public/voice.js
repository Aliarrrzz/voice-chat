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
    ['general', 'gaming', 'chill'].forEach(c =>
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
    this.stopVoiceDetection();
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

    ['general', 'gaming', 'chill'].forEach(c => {
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
    t.enabled = !t.enabled; State.micEnabled = t.enabled;
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
      State.localStream.getVideoTracks().forEach(t => { t.stop(); State.localStream.removeTrack(t); });
      State.videoEnabled = false;
      updateVideoUI();
      const v = document.getElementById('local-video'); if (v) v.remove();
      Object.values(State.peerConnections).forEach(pc => {
        pc.getSenders().filter(s => s.track && s.track.kind === 'video').forEach(s => pc.removeTrack(s));
      });
      if (State.socket && State.currentChannel)
        State.socket.emit('video-state', { channel: State.currentChannel, videoEnabled: false });
      showToast('📹 Camera off');
    } else {
      try {
        const vs = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
        const vt = vs.getVideoTracks()[0];
        State.localStream.addTrack(vt);
        State.videoEnabled = true;
        updateVideoUI();
        showLocalVideo(State.localStream);
        for (const [peerId, pc] of Object.entries(State.peerConnections)) {
          pc.addTrack(vt, State.localStream);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            State.socket.emit('offer', { to: peerId, offer });
          } catch (e) { console.warn('renegotiation failed for', peerId, e); }
        }
        if (State.socket && State.currentChannel)
          State.socket.emit('video-state', { channel: State.currentChannel, videoEnabled: true });
        showToast('📹 Camera on');
      } catch { showToast('📹 Camera access denied'); }
    }
  },

  // ── voice detection ──────────────────────────────────────
  stopVoiceDetection() {
    if (State.speakingInterval) { clearInterval(State.speakingInterval); State.speakingInterval = null; }
    if (State.audioContext) { try { State.audioContext.close(); } catch (e) {} State.audioContext = null; State.analyser = null; }
    State.isSpeaking = false;
  },

  startVoiceDetection() {
    this.stopVoiceDetection();
    if (!State.localStream) return;
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
    pc._screenStreamId = null; 
    pc.ontrack = e => {
      if (e.track.kind === 'audio') {
        const oldAudio = document.getElementById('audio-' + userId);
        if (oldAudio) oldAudio.remove();
        const a = document.createElement('audio');
        a.id = 'audio-' + userId;
        a.srcObject = e.streams[0]; a.autoplay = true; a.style.display = 'none';
        document.body.appendChild(a);
      }
      if (e.track.kind === 'video') {
        const label = e.track.label?.toLowerCase() || '';
        const senderStreamId = e.streams[0]?.id || '';


        const userState = State.userStates[userId] || {};
        const userHasCamera = userState.videoEnabled === true;
        const userIsSharing = userState.sharing === true;

        const isScreenByLabel = label.includes('screen') || label.includes('display') ||
          label.includes('monitor') || label.includes('window');
        const isScreenById = senderStreamId && State._remoteScreenStreamIds?.[userId] === senderStreamId;

        const isScreenByState = userIsSharing && !userHasCamera && userState.videoStream == null;

        const isScreenAsSecond = userState.videoStream != null;

        const isScreen = isScreenByLabel || isScreenById || isScreenByState || isScreenAsSecond;
        if (isScreen) {
          pc._screenStreamId = e.streams[0].id;

          if (!State._remoteScreenStreamIds) State._remoteScreenStreamIds = {};
          State._remoteScreenStreamIds[userId] = e.streams[0].id;
          if (!State.userStates[userId]) State.userStates[userId] = {};
          State.userStates[userId].screenStream = e.streams[0];

        } else {
          if (!State.userStates[userId]) State.userStates[userId] = {};
          State.userStates[userId].videoStream = e.streams[0];

          State.userStates[userId].videoEnabled = true;
          updateUserVideoIcons(userId);

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

      for (const [peerId, pc] of Object.entries(State.peerConnections)) {
        State.screenStream.getTracks().forEach(t => pc.addTrack(t, State.screenStream));
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          State.socket.emit('offer', { to: peerId, offer });
        } catch (e) { console.warn('screen renegotiation failed for', peerId, e); }
      }
      showToast('🖥 Screen share started');
    } catch { showToast('Screen access denied'); }
  },

  watchUserVideo(uid, name) {
    const realName = name || State.userNameMap[uid]?.name || uid?.slice(0, 8) || '—';


    const storedStream = State.userStates[uid]?.videoStream;
    if (storedStream && storedStream.active && storedStream.getVideoTracks().length > 0) {
      openScreenViewer(storedStream, realName + ' 📹');
      return;
    }

    const pc = State.peerConnections[uid];
    if (pc) {
      const videoReceivers = pc.getReceivers().filter(r =>
        r.track && r.track.kind === 'video' && r.track.readyState === 'live'
      );
      const screenStreamId = pc._screenStreamId;
      const camReceiver = videoReceivers.find(r => {
        if (!screenStreamId) return true;
        return !pc.getTransceivers().some(t =>
          t.receiver === r && t.receiver.track.id === screenStreamId
        );
      }) || videoReceivers[0];

      if (camReceiver) {
        const stream = new MediaStream([camReceiver.track]);
        if (!State.userStates[uid]) State.userStates[uid] = {};
        State.userStates[uid].videoStream = stream;
        openScreenViewer(stream, realName + ' 📹');
        return;
      }
    }


    showToast('📹 Waiting for camera stream...');
    setTimeout(() => {
      const retryStream = State.userStates[uid]?.videoStream;
      if (retryStream && retryStream.active) {
        openScreenViewer(retryStream, realName + ' 📹');
      } else {
        showToast('📹 Camera stream not available');
      }
    }, 1500);
  },

  watchUserScreen(uid, name) {
    const realName = name || State.userNameMap[uid]?.name || uid?.slice(0, 8) || '—';

    const storedStream = State.userStates[uid]?.screenStream;
    if (storedStream && storedStream.active && storedStream.getVideoTracks().length > 0) {
      openScreenViewer(storedStream, realName);
      return;
    }

    const pc = State.peerConnections[uid];
    if (pc) {
      const screenStreamId = pc._screenStreamId;
      const receivers = pc.getReceivers().filter(r =>
        r.track && r.track.kind === 'video' && r.track.readyState === 'live'
      );


      const screenReceiver = receivers[receivers.length - 1] || null;

      if (screenReceiver) {
        openScreenViewer(new MediaStream([screenReceiver.track]), realName);
        return;
      }
    }

    showToast('🖥 Waiting for screen stream...');
    document.getElementById('svPresenterName').textContent = realName;
    document.getElementById('svNoStream').style.display = '';
    document.getElementById('screenViewer').classList.add('show');

    setTimeout(() => {
      const retry = State.userStates[uid]?.screenStream;
      if (retry && retry.active) {
        openScreenViewer(retry, realName);
      }
    }, 1500);
  },
};

// ─── GLOBAL WRAPPERS  ─────────────────
function joinChannel(ch, label) { VoiceManager.joinChannel(ch, label); }
function disconnectCall() { VoiceManager.disconnect(); }
function toggleMic() { VoiceManager.toggleMic(); }
function toggleDeafen() { VoiceManager.toggleDeafen(); }
function toggleVideo() { VoiceManager.toggleVideo(); }
function shareScreen() { VoiceManager.shareScreen(); }