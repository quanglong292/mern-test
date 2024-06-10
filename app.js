const express = require("express");
const { default: mongoose } = require("mongoose");

const app = express();
const port = 3000;

const DB_TARGET = 'mern'
const uri =
  `mongodb+srv://quanglong292:123@cluster0.whlyxqj.mongodb.net/${DB_TARGET}?retryWrites=true&w=majority&appName=Cluster0`;

mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Database connected!"))
  .catch((err) => console.log("Database connection error: ", err));

// Routes
app.use(express.json());
app.use("/users", require("./src/routes/user.route"));

app.listen(port, () => {
  // http://localhost:3000
  console.log(`Example app listening on port ${port}`);
});
