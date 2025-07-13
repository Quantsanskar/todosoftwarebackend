const express = require("express")
const jwt = require("jsonwebtoken")
const User = require("../models/User")

const router = express.Router()

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  })
}

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post("/register", async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: "Please enter all fields" })
  }

  try {
    const userExists = await User.findOne({ username })
    if (userExists) {
      return res.status(400).json({ message: "User already exists" })
    }

    const user = await User.create({ username, password })

    res.status(201).json({
      _id: user._id,
      username: user.username,
      token: generateToken(user._id),
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Server error during registration" })
  }
})

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post("/login", async (req, res) => {
  const { username, password } = req.body

  try {
    const user = await User.findOne({ username })

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        token: generateToken(user._id),
      })
    } else {
      res.status(401).json({ message: "Invalid credentials" })
    }
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Server error during login" })
  }
})

module.exports = router
