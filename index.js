const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = 3000;

// middleware
app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wsfcvqt.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    // Database and Collection
    const naimsDb = client.db("innovatexDB");
    const usersCollection = naimsDb.collection("users");
    //User related API
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      // check is user already exists
      const existingUser = await usersCollection.findOne({
        email: newUser.email,
      });
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      newUser.created_at = new Date().toISOString();
      newUser.last_loggedIn = new Date().toISOString();
      newUser.role = "user";
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
