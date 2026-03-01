import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: '*', // In production, restrict this to your specific frontend IP/Domain
        }
    });

    io.on('connection', (socket) => {
        console.log('[Socket] A client connected:', socket.id);

        // Clients will join a room named after their User ID or Provider ID
        socket.on('join', (userId: string) => {
            socket.join(userId);
            console.log(`[Socket] Client ${socket.id} joined personal room: ${userId}`);
        });

        socket.on('disconnect', () => {
            console.log('[Socket] Client disconnected:', socket.id);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io has not been initialized yet!");
    }
    return io;
};
