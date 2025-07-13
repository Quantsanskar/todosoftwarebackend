const express = require("express")
const { protect } = require("../middleware/auth")
const Action = require("../models/Action")

const router = express.Router()

// @route   GET /api/actions
// @desc    Get last 20 actions
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const actions = await Action.find({}).sort({ timestamp: -1 }).limit(20).populate("userId", "username") // Populate username for display
    res.json(actions)
  } catch (error) {
    console.error("Error fetching actions:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
