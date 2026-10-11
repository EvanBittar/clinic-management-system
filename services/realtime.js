const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } }); // same open policy as your REST API for now

  // Every socket must present a valid JWT, exactly like the REST API requires one.
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('no token'));

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('invalid token'));
      socket.user = decoded; // { userId, role, clinicId }
      next();
    });
  });

  io.on('connection', (socket) => {
    // One private room per person: you only ever receive your own notifications.
    socket.join(`user:${socket.user.userId}`);
  });

  return io;
}

// Safe to call even if realtime was never started (for example inside tests): it does nothing.
function emitToUser(userId, event, payload) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

module.exports = { initRealtime, emitToUser };
