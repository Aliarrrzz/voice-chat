class PingMonitor {
  constructor(socket, options = {}) {
    this.socket = socket;
    this.interval = options.interval || 3000;   
    this.history  = [];                         
    this.current  = null;
    this.timer    = null;
    this.onUpdate = options.onUpdate || (() => {});

    this.socket.on('pong', (ts) => {
      const rtt = Date.now() - ts;
      this._record(rtt);
    });
  }

  start() {
    this.timer = setInterval(() => this._ping(), this.interval);
    this._ping(); 
  }

  stop() {
    clearInterval(this.timer);
  }

  _ping() {
    this.socket.emit('ping', Date.now());
  }

  _record(rtt) {
    this.current = rtt;
    this.history.push(rtt);
    if (this.history.length > 10) this.history.shift();
    this.onUpdate(this._stats());
  }

  _stats() {
    const h = this.history;
    return {
      current: this.current,
      avg:  Math.round(h.reduce((a, b) => a + b, 0) / h.length),
      min:  Math.min(...h),
      max:  Math.max(...h),
      quality: this._quality(this.current),
    };
  }

  
  _quality(ms) {
    if (ms < 50)  return { label: 'Perfect',   color: '#43b581', icon: '🟢' };
    if (ms < 100) return { label: 'Good',    color: '#faa61a', icon: '🟡' };
    if (ms < 200) return { label: 'Avarage',  color: '#f04747', icon: '🟠' };
    return              { label: 'Poor',    color: '#f04747', icon: '🔴' };
  }
}