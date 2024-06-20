const express = require("express");
require("dotenv").config();
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: axios } = require("axios");

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

let recipeCollection,
  categories,
  usersCollection,
  favorites,
  schoolsLocationsCollection,
  kindergartensLocationsCollection,
  socialChildProjectsLocationsCollection,
  socialTeenagerProjectsLocationsCollection;

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
favorites = client.db("chemnitzMapDB").collection("favorites");
schoolsLocationsCollection = client
  .db("chemnitzMapDB")
  .collection("schoolsLocationsCollection");
kindergartensLocationsCollection = client
  .db("chemnitzMapDB")
  .collection("kindergartensLocationsCollection");
socialChildProjectsLocationsCollection = client
  .db("chemnitzMapDB")
  .collection("socialChildProjectsLocationsCollection");
socialTeenagerProjectsLocationsCollection = client
  .db("chemnitzMapDB")
  .collection("socialTeenagerProjectsLocationsCollection");

app.get("/", (req, res) => {
  res.send("Welcome to the server");
});

// Users
app.post("/user", async (req, res) => {
  const user = req.body;

  const token = createToken(user);

  const isUserExist = await usersCollection.findOne({ email: user?.email });

  if (isUserExist?._id) {
    if (isUserExist?.isDeleted) {
      return res.status(403).json({
        message:
          "User is disabled by the admin. Please contact the admin for more details.",
      });
    }
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

// app.post("/recipe", async (req, res) => {
//   try {
//     const recipeData = req.body;
//     console.log("Adding recipe:", recipeData);
//     const result = await recipeCollection.insertOne(recipeData);
//     return res.send(result);
//   } catch (error) {
//     console.error("Error adding recipe:", error);
//     return res.status(500).send("An error occurred while adding the recipe");
//   }
// });

// admin
app.get("/users", verifyToken, async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    const usersWithStatus = users.map((user) => ({
      ...user,
      status: user.isDeleted ? "deleted" : "active",
    }));
    return res.send(usersWithStatus);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send("An error occurred while fetching users");
  }
});

// // Update User Status
app.patch("/users/:id/status", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "inactive", "deleted"].includes(status)) {
    return res.status(400).send("Invalid status value");
  }

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, isDeleted: status === "deleted" } }
    );
    if (result.modifiedCount === 1) {
      return res.send({ message: "User status updated successfully" });
    } else {
      return res.status(404).send("User not found");
    }
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).send("An error occurred while updating user status");
  }
});

// Update User Role to Admin
app.patch("/users/:id/make-admin", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isAdmin: 1 } } // Assuming isAdmin is 1 for admin
    );
    if (result.modifiedCount === 1) {
      return res.send({ message: "User role updated to admin successfully" });
    } else {
      return res.status(404).send("User not found");
    }
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).send("An error occurred while updating user role");
  }
});

// Toggle User Admin Status
app.patch("/users/:id/toggle-admin", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Find the current admin status
    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Toggle the admin status
    const newIsAdmin = user.isAdmin === 1 ? 0 : 1;

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isAdmin: newIsAdmin } }
    );

    if (result.modifiedCount === 1) {
      return res.send({
        message: "User admin status updated successfully",
        newIsAdmin,
      });
    } else {
      return res.status(500).send("Failed to update user admin status");
    }
  } catch (error) {
    console.error("Error updating user admin status:", error);
    res.status(500).send("An error occurred while updating user admin status");
  }
});

app.get("/users/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await usersCollection.findOne({
      _id: new ObjectId(id),
    });
    return res.send(result);
  } catch (error) {
    console.error("Error finding user:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching the user" });
  }
});

// app.patch("/recipes/:id", async (req, res) => {
//   const id = req.params.id;
//   const updatedData = req.body;
//   const result = await recipeCollection.updateOne(
//     { _id: new ObjectId(id) },
//     { $set: updatedData }
//   );
//   return res.send(result);
// });

app.patch("/users/soft-delete/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isDeleted: true } }
    );
    return res.send(result);
  } catch (error) {
    console.error("Error soft deleting user:", error);
    res.status(500).send("An error occurred while soft deleting the user");
  }
});

app.delete("/users/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await usersCollection.deleteOne({
      _id: new ObjectId(id),
    });
    return res.send(result);
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send("An error occurred while deleting the user");
  }
});

//school Locations

// Endpoint to add new school location
app.post("/locations/schools", verifyToken, async (req, res) => {
  const locationData = req.body;
  try {
    const result = await schoolsLocationsCollection.insertOne(locationData);
    res.send({
      status: "success",
      message: "Location added successfully",
      result,
    });
  } catch (error) {
    console.error("Error adding location:", error);
    res.status(500).send("An error occurred while adding the location");
  }
});

// Endpoint to fetch all schools locations (merge ArcGIS API and MongoDB data)
app.get("/locations/schools", async (req, res) => {
  try {
    const arcgisResponse = await axios.get(
      "https://services6.arcgis.com/jiszdsDupTUO3fSM/arcgis/rest/services/Schulen_OpenData/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson"
    );
    const arcgisLocations = arcgisResponse.data.features;
    const dbLocations = await schoolsLocationsCollection.find().toArray();

    const allLocations = {
      type: "FeatureCollection",
      features: [...arcgisLocations, ...dbLocations],
    };
    res.json(allLocations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).send("An error occurred while fetching locations");
  }
});

// Delete school project
app.delete("/location/school/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await schoolsLocationsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    return res.send(result);
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send("An error occurred while deleting the user");
  }
});
//Social Child Projects Locations

// Endpoint to add new school location
app.post("/locations/social-child-projects", verifyToken, async (req, res) => {
  const locationData = req.body;
  try {
    const result = await socialChildProjectsLocationsCollection.insertOne(
      locationData
    );
    res.send({
      status: "success",
      message: "Location added successfully",
      result,
    });
  } catch (error) {
    console.error("Error adding location:", error);
    res.status(500).send("An error occurred while adding the location");
  }
});

// Endpoint to fetch all schools locations (merge ArcGIS API and MongoDB data)
app.get("/locations/social-child-projects", async (req, res) => {
  try {
    const arcgisResponse = await axios.get(
      "https://services6.arcgis.com/jiszdsDupTUO3fSM/arcgis/rest/services/Schulsozialarbeit_FL_1/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson"
    );
    const arcgisLocations = arcgisResponse.data.features;
    const dbLocations = await socialChildProjectsLocationsCollection
      .find()
      .toArray();

    const allLocations = {
      type: "FeatureCollection",
      features: [...arcgisLocations, ...dbLocations],
    };
    res.json(allLocations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).send("An error occurred while fetching locations");
  }
});

// Delete school project
app.delete("/location/social-child-project/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await socialChildProjectsLocationsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    return res.send(result);
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send("An error occurred while deleting the user");
  }
});

//Add social teenager projects Locations

// Endpoint to add new location
app.post(
  "/locations/social-teenager-projects",
  verifyToken,
  async (req, res) => {
    const locationData = req.body;
    try {
      const result = await socialTeenagerProjectsLocationsCollection.insertOne(
        locationData
      );
      res.send({
        status: "success",
        message: "Location added successfully",
        result,
      });
    } catch (error) {
      console.error("Error adding location:", error);
      res.status(500).send("An error occurred while adding the location");
    }
  }
);

// Endpoint to fetch all locations (merge ArcGIS API and MongoDB data)
app.get("/locations/social-teenager-projects", async (req, res) => {
  try {
    const arcgisResponse = await axios.get(
      "https://services6.arcgis.com/jiszdsDupTUO3fSM/arcgis/rest/services/Jugendberufshilfen_FL_1/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson"
    );
    const arcgisLocations = arcgisResponse.data.features;
    const dbLocations = await socialTeenagerProjectsLocationsCollection
      .find()
      .toArray();

    const allLocations = {
      type: "FeatureCollection",
      features: [...arcgisLocations, ...dbLocations],
    };
    res.json(allLocations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).send("An error occurred while fetching locations");
  }
});

// Delete Social Teenager project
app.delete("/location/social-teenager-project/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await socialTeenagerProjectsLocationsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    return res.send(result);
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send("An error occurred while deleting the user");
  }
});

// Add a new endpoint to handle adding a location to favorites
app.post("/user/favorite", async (req, res) => {
  const { userEmail, location } = req.body;

  // Create a new favorite document
  const favorite = {
    userEmail,
    location,
  };

  try {
    // Insert the favorite into the favorites collection
    const result = await favorites.insertOne(favorite);
    return res.send({
      status: "success",
      message: "Location added to favorites",
      result,
    });
  } catch (error) {
    console.error("Error adding to favorites:", error);
    return res
      .status(500)
      .send("An error occurred while adding the location to favorites");
  }
});

// get favorite by user email

app.get("/user/favorite/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const favLocations = await favorites.find({ userEmail: email }).toArray();
    return res.json(favLocations);
  } catch (error) {
    console.error("Error fetching favorite locations:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching locations" });
  }
});

// Remove from Favorite
app.delete("/user/favorite/:email/:locationId", async (req, res) => {
  const { email, locationId } = req.params;

  try {
    // Delete the favorite from the favorites collection
    const result = await favorites.deleteOne({
      userEmail: email,
      _id: new ObjectId(locationId),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Favorite not found" });
    }

    return res.json({
      status: "success",
      message: "Location removed from favorites",
    });
  } catch (error) {
    console.error("Error removing from favorites:", error);
    return res.status(500).json({
      error: "An error occurred while removing the location from favorites",
    });
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
    const activeUsersCount = await usersCollection.countDocuments({
      isDeleted: { $ne: true },
    });

    const deletedUsersCount = await usersCollection.countDocuments({
      isDeleted: true,
    });

    const totalAdmins = await usersCollection.countDocuments({
      isAdmin: 1,
    });

    return res.json({
      totalUsers,
      totalStudents,
      totalParents,
      activeUsersCount,
      deletedUsersCount,
      totalAdmins,
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
