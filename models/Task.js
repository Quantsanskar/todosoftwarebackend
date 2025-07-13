const mongoose = require("mongoose")

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  status: {
    type: String,
    enum: ["Todo", "In Progress", "Done"],
    default: "Todo",
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Medium",
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

// Ensure task titles are unique per board (globally unique for simplicity here)
TaskSchema.index({ title: 1 }, { unique: true })

module.exports = mongoose.model("Task", TaskSchema)
