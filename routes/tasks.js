const express = require("express")
const { protect } = require("../middleware/auth")
const Task = require("../models/Task")
const User = require("../models/User")
const Action = require("../models/Action")
const { getIo } = require("../socket")

const router = express.Router()

const logAction = async (type, taskId, userId, username, details) => {
  try {
    await Action.create({ type, taskId, userId, username, details })
    const latestActions = await Action.find({}).sort({ timestamp: -1 }).limit(20).populate("userId", "username") // Populate username for display
    const io = getIo()
    io.emit("actionLogged", latestActions)
  } catch (error) {
    console.error("Error logging action:", error)
  }
}

// Helper to check for column name conflict
const isColumnName = (title) => ["Todo", "In Progress", "Done"].includes(title)

// @route   GET /api/tasks
// @desc    Get all tasks
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const tasks = await Task.find({}).populate("assignedTo", "username")
    res.json(tasks)
  } catch (error) {
    console.error("Error fetching tasks:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post("/", protect, async (req, res) => {
  const { title, description, status, priority, assignedTo } = req.body

  if (!title) {
    return res.status(400).json({ message: "Task title is required" })
  }
  if (isColumnName(title)) {
    return res.status(400).json({ message: "Task title cannot be a column name (Todo, In Progress, Done)" })
  }

  try {
    const existingTask = await Task.findOne({ title })
    if (existingTask) {
      return res.status(400).json({ message: "Task title must be unique" })
    }

    const newTask = new Task({
      title,
      description,
      status: status || "Todo",
      priority: priority || "Medium",
      assignedTo: assignedTo || null,
      lastModifiedBy: req.user._id,
      lastModifiedAt: new Date(),
    })

    const savedTask = await newTask.save()
    await savedTask.populate("assignedTo", "username")

    logAction("TASK_CREATED", savedTask._id, req.user._id, req.user.username, `created task "${savedTask.title}"`)
    const io = getIo(); 
    io.emit("taskAdded", savedTask)
    res.status(201).json(savedTask)
  } catch (error) {
    console.error("Error creating task:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT /api/tasks/:id
// @desc    Update a task
// @access  Private
router.put("/:id", protect, async (req, res) => {
  const { title, description, status, priority, assignedTo, lastModifiedAt: clientLastModifiedAt } = req.body

  if (!title) {
    return res.status(400).json({ message: "Task title is required" })
  }
  if (isColumnName(title)) {
    return res.status(400).json({ message: "Task title cannot be a column name (Todo, In Progress, Done)" })
  }

  try {
    const task = await Task.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    // Check for title uniqueness if title is changed
    if (title !== task.title) {
      const existingTask = await Task.findOne({ title })
      if (existingTask && existingTask._id.toString() !== req.params.id) {
        return res.status(400).json({ message: "Task title must be unique" })
      }
    }

    // Conflict Handling
    if (clientLastModifiedAt && new Date(clientLastModifiedAt).getTime() < task.lastModifiedAt.getTime()) {
      const latestTask = await Task.findById(req.params.id).populate("assignedTo", "username")
      const lastModifier = await User.findById(latestTask.lastModifiedBy).select("username")
      return res.status(409).json({
        message: "Conflict: Task has been modified by another user.",
        serverVersion: latestTask,
        lastModifiedBy: lastModifier ? lastModifier.username : "Unknown",
      })
    }

    const oldStatus = task.status
    const oldAssignedTo = task.assignedTo ? task.assignedTo.toString() : null

    task.title = title
    task.description = description
    task.status = status
    task.priority = priority
    task.assignedTo = assignedTo || null
    task.lastModifiedBy = req.user._id
    task.lastModifiedAt = new Date()

    const updatedTask = await task.save()
    await updatedTask.populate("assignedTo", "username")

    let actionDetails = `updated task "${updatedTask.title}"`
    if (oldStatus !== updatedTask.status) {
      actionDetails += ` (status changed from ${oldStatus} to ${updatedTask.status})`
      logAction(
        "TASK_STATUS_CHANGED",
        updatedTask._id,
        req.user._id,
        req.user.username,
        `changed status of "${updatedTask.title}" to "${updatedTask.status}"`,
      )
    }
    if (oldAssignedTo !== (updatedTask.assignedTo ? updatedTask.assignedTo.toString() : null)) {
      const newAssignee = updatedTask.assignedTo ? updatedTask.assignedTo.username : "unassigned"
      actionDetails += ` (assigned to ${newAssignee})`
      logAction(
        "TASK_ASSIGNED",
        updatedTask._id,
        req.user._id,
        req.user.username,
        `assigned "${updatedTask.title}" to ${newAssignee}`,
      )
    }
    logAction("TASK_UPDATED", updatedTask._id, req.user._id, req.user.username, actionDetails)
    const io = getIo(); 
    io.emit("taskUpdated", updatedTask)
    res.json(updatedTask)
  } catch (error) {
    console.error("Error updating task:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    await task.deleteOne()
    logAction("TASK_DELETED", req.params.id, req.user._id, req.user.username, `deleted task "${task.title}"`)
    const io = getIo(); 
    io.emit("taskDeleted", req.params.id)
    res.json({ message: "Task removed" })
  } catch (error) {
    console.error("Error deleting task:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT /api/tasks/:id/drag-drop
// @desc    Update task status and order after drag-drop
// @access  Private
router.put("/:id/drag-drop", protect, async (req, res) => {
  const { newStatus } = req.body

  try {
    const task = await Task.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    const oldStatus = task.status
    task.status = newStatus
    task.lastModifiedBy = req.user._id
    task.lastModifiedAt = new Date()

    const updatedTask = await task.save()
    await updatedTask.populate("assignedTo", "username")

    logAction(
      "TASK_DRAGGED",
      updatedTask._id,
      req.user._id,
      req.user.username,
      `dragged task "${updatedTask.title}" from "${oldStatus}" to "${newStatus}"`,
    )
    const io = getIo(); 
    io.emit("taskUpdated", updatedTask) // Emit as taskUpdated to update status
    res.json(updatedTask)
  } catch (error) {
    console.error("Error updating task status via drag-drop:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST /api/tasks/:id/smart-assign
// @desc    Smart assign a task to user with fewest active tasks
// @access  Private
router.post("/:id/smart-assign", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    // Find all active users (users who have tasks)
    const allUsers = await User.find({})
    if (allUsers.length === 0) {
      return res.status(400).json({ message: "No users available for assignment." })
    }

    // Count active tasks for each user
    const activeTasks = await Task.find({ status: { $in: ["Todo", "In Progress"] } })
    const userTaskCounts = {}
    allUsers.forEach((user) => {
      userTaskCounts[user._id.toString()] = 0
    })
    activeTasks.forEach((task) => {
      if (task.assignedTo) {
        const userId = task.assignedTo.toString()
        if (userTaskCounts[userId] !== undefined) {
          userTaskCounts[userId]++
        }
      }
    })

    // Find user with the fewest active tasks
    let minTasks = Number.POSITIVE_INFINITY
    let userToAssign = null

    for (const userId in userTaskCounts) {
      if (userTaskCounts[userId] < minTasks) {
        minTasks = userTaskCounts[userId]
        userToAssign = userId
      }
    }

    if (!userToAssign) {
      return res.status(500).json({ message: "Could not determine a user for smart assignment." })
    }

    const oldAssignee = task.assignedTo ? (await User.findById(task.assignedTo)).username : "unassigned"
    task.assignedTo = userToAssign
    task.lastModifiedBy = req.user._id
    task.lastModifiedAt = new Date()

    const updatedTask = await task.save()
    await updatedTask.populate("assignedTo", "username")

    const newAssignee = updatedTask.assignedTo ? updatedTask.assignedTo.username : "unassigned"
    logAction(
      "TASK_ASSIGNED",
      updatedTask._id,
      req.user._id,
      req.user.username,
      `smart assigned "${updatedTask.title}" from ${oldAssignee} to ${newAssignee}`,
    )
    const io = getIo(); 
    io.emit("taskUpdated", updatedTask)
    res.json(updatedTask)
  } catch (error) {
    console.error("Error during smart assign:", error)
    res.status(500).json({ message: "Server error during smart assignment" })
  }
})
router.get('/cron-task', (req, res) => {
  // You can run any logic here
  console.log('Cron job endpoint hit at', new Date());

  // Optionally respond with something
  res.status(200).send('Cron task executed');
});
module.exports = router
