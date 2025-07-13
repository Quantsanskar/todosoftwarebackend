let io

const setupSocketIO = (socketServer) => {
  io = socketServer

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id)

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id)
    })
  })
}

const getIo = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized!")
  }
  return io
}

module.exports = { setupSocketIO, getIo }
