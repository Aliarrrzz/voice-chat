// ─── GLOBAL STATE ────────────────────────────────────────────
const State = {
  myName: '',
  myAv: '🦊',
  localStream: null,
  screenStream: null,
  peerConnections: {},
  currentChannel: null,
  clientId: null,
  socket: null,
  micEnabled: true,
  deafened: false,
  videoEnabled: false,
  audioContext: null,
  analyser: null,
  speakingInterval: null,
  isSpeaking: false,
  userStates: {},    // { uid: { muted, deafened, sharing } }
  userNameMap: {},   // { socketId: { name, avatar } }
};
