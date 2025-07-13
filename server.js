const express = require("express")
const mongoose = require("mongoose")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")
require("dotenv").config()

const authRoutes = require("./routes/auth")
const taskRoutes = require("./routes/tasks")
const actionRoutes = require("./routes/actions")
const { setupSocketIO } = require("./socket")

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    // origin: process.env.CLIENT_URL || "http://localhost:3000", // Allow your frontend origin
    origin: process.env.CLIENT_URL || "https://todosoftware.vercel.app/", // Allow your frontend origin
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
})

// Initialize Socket.IO
setupSocketIO(io)

// Middleware
app.use(
  cors({
    // origin: process.env.CLIENT_URL || "http://localhost:3000",
    origin: process.env.CLIENT_URL || "https://todosoftware.vercel.app/",
    credentials: true,
  }),
)
app.use(express.json())

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    serverApi: {
      version: '1',
      strict: true,
      deprecationErrors: true,
    }
  })
  .then(() => {
    console.log("Connected to MongoDB successfully!");
    // Test the connection with a ping
    return mongoose.connection.db.admin().ping();
  })
  .then(() => {
    console.log("MongoDB ping successful - Database is responsive");
  })
  .catch((err) => {
    console.error("MongoDB connection error details:", {
      message: err.message,
      code: err.code,
      codeName: err.codeName,
      errorResponse: err.errorResponse
    });
  })

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/tasks", taskRoutes)
app.use("/api/actions", actionRoutes)

const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
