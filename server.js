const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));

const channels = {};

function getChannelUsers(ch) {
  if (!channels[ch]) return [];
  return Array.from(channels[ch].entries()).map(([id, info]) => ({
    id,
    name: info.name,
    avatar: info.avatar
  }));
}

function broadcastChannelUsers(ch) {
  const users = getChannelUsers(ch);

  // emit to channel members (for full member panel)
  io.to(ch).emit('channel-users', users);

  // emit sidebar snapshot to ALL clients so everyone can see who's in each channel
  io.emit('channel-count', { channel: ch, count: users.length });
  io.emit('channel-sidebar', { channel: ch, users });
}

io.on('connection', (socket) => {
  console.log(`[+] connected: ${socket.id}`);

  let currentChannel = null;
  let userInfo = { name: 'Unknown', avatar: '👤' };


  socket.on('set-info', ({ name, avatar }) => {
    userInfo = { name: name || 'Unknown', avatar: avatar || '👤' };
    console.log(`[i] ${socket.id} set name: ${name}`);

    // send current state of all channels to this new client
    const snapshot = {};
    Object.keys(channels).forEach(ch => {
      snapshot[ch] = getChannelUsers(ch);
    });
    socket.emit('init-channels', snapshot);
  });

  socket.on('join', (channelName) => {

    if (currentChannel) {
      leaveChannel(socket, currentChannel);
    }

    currentChannel = channelName;

    if (!channels[channelName]) channels[channelName] = new Map();
    channels[channelName].set(socket.id, userInfo);

    socket.join(channelName);
    console.log(`[+] ${userInfo.name} (${socket.id}) joined ${channelName}`);

    socket.to(channelName).emit('user-joined', socket.id);

    broadcastChannelUsers(channelName);
  });

  socket.on('leave', (channelName) => {
    leaveChannel(socket, channelName);
    currentChannel = null;
  });

  socket.on('offer', ({ to, offer }) => {
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice', ({ to, candidate }) => {
    socket.to(to).emit('ice', { from: socket.id, candidate });
  });

  socket.on('screen-share-state', ({ channel, sharing }) => {
    if (!channel) return;
    socket.to(channel).emit('screen-share-state', { userId: socket.id, sharing });
    console.log(`[screen] ${userInfo.name} sharing: ${sharing}`);
  });


  socket.on('mute-state', ({ channel, muted, deafened: deaf }) => {
    if (!channel) return;
    socket.to(channel).emit('mute-state', { userId: socket.id, muted, deafened: deaf });
  });

  socket.on('speaking', ({ channel, active }) => {
    if (!channel) return;
    socket.to(channel).emit('speaking', { userId: socket.id, active });
  });

  socket.on('chat', ({ channel, msg, displayName, avatar }) => {
    if (!channel || !msg) return;
    const payload = {
      from: socket.id,
      displayName: displayName || userInfo.name,
      avatar: avatar || userInfo.avatar,
      msg,
      timestamp: Date.now()
    };
    io.to(channel).emit('chat', payload);
    console.log(`[chat] ${displayName} in ${channel}: ${msg}`);
  });

  socket.on('disconnect', () => {
    console.log(`[-] disconnected: ${socket.id}`);
    if (currentChannel) leaveChannel(socket, currentChannel);
  });

  function leaveChannel(sock, channelName) {
    if (!channels[channelName]) return;
    channels[channelName].delete(sock.id);
    sock.leave(channelName);
    sock.to(channelName).emit('user-left', sock.id);
    broadcastChannelUsers(channelName);
    if (channels[channelName].size === 0) delete channels[channelName];
    console.log(`[-] ${userInfo.name} left ${channelName}`);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Echo server running on http://0.0.0.0:${PORT}\n`);
});