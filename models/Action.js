const mongoose = require("mongoose")

const ActionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ["TASK_CREATED", "TASK_UPDATED", "TASK_DELETED", "TASK_ASSIGNED", "TASK_STATUS_CHANGED", "TASK_DRAGGED"],
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Task",
    required: false, // Not required for all action types (e.g., user login)
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
})

ActionSchema.index({ timestamp: -1 }) // Index for efficient fetching of latest actions

module.exports = mongoose.model("Action", ActionSchema)
