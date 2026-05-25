// ─── PING MANAGER ────────────────────────────────────────────
const PingManager = {
  _timer: null,
  _channels: ['general', 'gaming', 'chill'],

  start(channelId) {
    this.stop();
    this._channels.forEach(ch => {
      if (ch === channelId) return;
      this._setIdle(ch);
    });
    const wifiEl = document.getElementById('wifi-' + channelId);
    const statEl = document.getElementById('pingstatus-' + channelId);
    if (wifiEl) wifiEl.classList.add('connected');
    if (statEl) { statEl.className = 'ping-status-connected'; statEl.textContent = '🟢 Connected'; }

    const doPing = () => {
      if (!State.socket || !State.currentChannel) return;
      const t = Date.now();
      State.socket.emit('ping', t);
      State.socket.once('pong', ts => {
        const ms    = Date.now() - ts;
        const color = ms < 50 ? 'var(--green)' : ms < 100 ? '#fbbf24' : 'var(--red)';
        const label = ms < 50 ? 'Good'         : ms < 100 ? 'Fair'    : 'Poor';
        const pingEl = document.getElementById('pingval-'   + channelId);
        const qualEl = document.getElementById('pingqual-'  + channelId);
        const wEl    = document.getElementById('wifi-'      + channelId);
        if (pingEl) { pingEl.textContent = ms + ' ms'; pingEl.style.color = color; }
        if (qualEl) { qualEl.textContent = label;       qualEl.style.color = color; }
        if (wEl)    { wEl.style.color = color; }
      });
    };

    doPing();
    this._timer = setInterval(doPing, 3000);
  },

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._channels.forEach(ch => this._setIdle(ch));
  },

  _setIdle(ch) {
    const pingEl = document.getElementById('pingval-'    + ch);
    const qualEl = document.getElementById('pingqual-'   + ch);
    const statEl = document.getElementById('pingstatus-' + ch);
    const wifiEl = document.getElementById('wifi-'       + ch);
    if (pingEl) { pingEl.textContent = '-- ms'; pingEl.style.color = ''; }
    if (qualEl) { qualEl.textContent = '—';     qualEl.style.color = ''; }
    if (statEl) { statEl.className = 'ping-status-idle'; statEl.textContent = '⚪ Not Connected'; }
    if (wifiEl) { wifiEl.classList.remove('connected'); wifiEl.style.color = ''; }
  },
};