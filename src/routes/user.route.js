const express = require("express");
const { createUser } = require("../controllers/user.controller");

const router = express.Router();

// GET /users
// router.get("/", createUser);

// GET /users/:id
router.get("/:id", (req, res) => {
  // Logic to fetch a specific user by ID
});

// POST /users
router.post("/", createUser);

// PUT /users/:id
router.put("/:id", (req, res) => {
  // Logic to update a specific user by ID
});

// DELETE /users/:id
router.delete("/:id", (req, res) => {
  // Logic to delete a specific user by ID
});

module.exports = router;
