const express = require("express");
require("dotenv").config();
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 5000;

app.use(
  cors({ origin: ["http://localhost:5173", "https://roshui-ghor.web.app"] })
);
app.use(express.json());

function createToken(user) {
  const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  return token;
}

function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader)
      return res.status(401).send("Authorization header missing");
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).send("Token missing");
    const verify = jwt.verify(token, process.env.JWT_SECRET);
    if (!verify?.email)
      return res.status(401).send("Token verification failed");
    req.user = verify.email;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).send("You are not authorized");
  }
}

const uri = process.env.DB_URL;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let recipeCollection, categories, usersCollection;

const dbConnect = () => {
  try {
    client.connect();
    console.log("Database Connected Successfully✅");
  } catch (error) {
    console.log(error.name, error.message);
  }
};
dbConnect();

usersCollection = client.db("chemnitzMapDB").collection("usersCollection");
categories = client.db("chemnitzMapDB").collection("categories");
recipeCollection = client.db("chemnitzMapDB").collection("recipeCollection");

app.get("/", (req, res) => {
  res.send("Welcome to the server");
});

// Users
app.post("/user", async (req, res) => {
  const user = req.body;

  const token = createToken(user);

  const isUserExist = await usersCollection.findOne({ email: user?.email });

  if (isUserExist?._id) {
    return res.send({ status: "success", message: "Login success", token });
  }
  await usersCollection.insertOne(user);
  return res.send({ token });
});

app.get("/user/get/:id", async (req, res) => {
  const id = req.params.id;
  const result = await usersCollection.findOne({ _id: new ObjectId(id) });
  return res.send(result);
});

app.get("/user/:email", async (req, res) => {
  const email = req.params.email;
  const result = await usersCollection.findOne({ email });
  return res.send(result);
});

app.patch("/user/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  const userData = req.body;
  const result = await usersCollection.updateOne(
    { email },
    { $set: userData },
    { upsert: true }
  );
  return res.send(result);
});

app.post("/recipes", async (req, res) => {
  try {
    const recipeData = req.body;
    console.log("Adding recipe:", recipeData);
    const result = await recipeCollection.insertOne(recipeData);
    return res.send(result);
  } catch (error) {
    console.error("Error adding recipe:", error);
    return res.status(500).send("An error occurred while adding the recipe");
  }
});

app.get("/recipes", async (req, res) => {
  try {
    const data = recipeCollection.find();
    const result = await data.toArray();
    return res.send(result);
  } catch (error) {
    console.log(error.message);
  }
});

app.get("/recipes/:id", async (req, res) => {
  const id = req.params.id;
  console.log(id);
  try {
    const result = await recipeCollection.findOne({
      _id: new ObjectId(id),
    });
    return res.send(result);
  } catch (error) {
    console.error("Error finding recipe:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching the recipe" });
  }
});

app.patch("/recipes/:id", async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;
  const result = await recipeCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );
  return res.send(result);
});

app.delete("/recipes/:id", async (req, res) => {
  const id = req.params.id;
  const result = await recipeCollection.deleteOne({
    _id: new ObjectId(id),
  });
  return res.send(result);
});

app.get("/categories", async (req, res) => {
  try {
    const data = categories.find();
    const result = await data.toArray();
    return res.send(result);
  } catch (error) {
    console.log(error.message);
  }
});

app.get("/users/chefs", async (req, res) => {
  try {
    const chefs = await usersCollection.find({ role: "chef" }).toArray();
    return res.send(chefs);
  } catch (error) {
    console.error("Error fetching chefs:", error);
    res.status(500).json({ error: "An error occurred while fetching chefs" });
  }
});

app.get("/recipes/chef/:email", async (req, res) => {
  try {
    const { email } = req.params;
    console.log(email);
    const recipes = await recipeCollection.find({ email: email }).toArray();
    return res.json(recipes);
  } catch (error) {
    console.error("Error fetching recipes by chef:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching recipes" });
  }
});

app.get("/stats", async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const totalStudents = await usersCollection.countDocuments({
      role: "Student",
    });
    const totalParents = await usersCollection.countDocuments({
      role: "Parents",
    });
    const totalRecipes = await recipeCollection.countDocuments();
    const totalCategories = await categories.countDocuments();

    const categoryWiseRecipes = await categories
      .aggregate([
        {
          $lookup: {
            from: "recipeCollection",
            localField: "title",
            foreignField: "category",
            as: "recipes",
          },
        },
        {
          $project: {
            _id: 0,
            category: "$title",
            recipeCount: { $size: "$recipes" },
          },
        },
      ])
      .toArray();

    return res.json({
      totalUsers,
      totalStudents,
      totalParents,
      totalRecipes,
      totalCategories,
      categoryWiseRecipes,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "An error occurred while fetching stats" });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

app.listen(port, () => {
  console.log(`Server is listening at ${port}`);
});
