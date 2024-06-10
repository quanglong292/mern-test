const User = require("../models/User.schema");

const createUser = (req, res) => {
  const body = req.body;
  console.log({ body });
  const newUser = new User({
    name: "Test",
    email: "mail",
    password: "pass",
    age: 10,
  });

  if (!body)
    res.status(400).json({ success: false, error: "You must provide a user" });

  newUser
    .save()
    .then((user) => {
      res.status(201).json(user);
    })
    .catch((error) => {
      res.status(500).json({ error: error.message });
    });
};

const getUser = (req, res) => {
  // Logic to get a user by ID
};

const updateUser = (req, res) => {
  // Logic to update a user by ID
};

const deleteUser = (req, res) => {
  // Logic to delete a user by ID
};

// Export the controller functions
module.exports = {
  createUser,
  getUser,
  updateUser,
  deleteUser,
};
