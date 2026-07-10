import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer;

export function setIo(instance: SocketIOServer) {
  io = instance;
}

export function getIo(): SocketIOServer {
  return io;
}
