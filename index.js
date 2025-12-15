const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = 3000;

// middleware
app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const contestsCollection = naimsDb.collection("allContest");
    const contestsSubmission = naimsDb.collection("contestSubmission");

    app.get("/", async (req, res) => {
      res.send("hello world");
    });

    //User related API
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
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
      newUser.bio = "--";
      newUser.address = "--";
      newUser.totalWon = 0;
      newUser.totalParticipated = 0;

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const updatedUser = req.body;
      const filter = { _id: new ObjectId(id) };
      console.log(updatedUser);
      const updateDoc = {
        $set: {
          ...updatedUser,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Contests related API
    app.get("/contests/:status", async (req, res) => {
      const search = req.query.search;
      const { status } = req.params;
      console.log("status", status);
      const query = {};
      if (search) {
        query.category = { $regex: search, $options: "i" };
      }
      if (status) {
        query.status = status;
      }
      console.log(query);
      const cursor = contestsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/contests", async (req, res) => {
      const contestDetails = req.body;
      const result = await contestsCollection.insertOne(contestDetails);
      res.send(result);
    });

    app.get("/contests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.findOne(query);
      res.send(result);
    });

    app.get("/popular-contests", async (req, res) => {
      const cursor = contestsCollection
        .find()
        .sort({ participants: -1 })
        .limit(8);
      const result = await cursor.toArray();
      res.send(result);
    });

    // user task submitted api
    app.post("/submissions", async (req, res) => {
      const submission = req.body;
      const result = await contestsSubmission.insertOne(submission);
      res.send(result);
    });

    // Payment related API
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: paymentInfo.prize,
              product_data: {
                name: `${paymentInfo.creator_name}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          contest_id: paymentInfo._id,
        },
        mode: "payment",

        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
      });
      // console.log(paymentInfo);
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === "paid") {
          const query = {
            _id: new ObjectId(session.metadata.contest_id),
          };

          const update = {
            $inc: { participants: 1 },
          };

          const result = await contestsCollection.updateOne(query, update);

          return res.send(result);
        }

        res.status(400).send({ message: "Payment not completed" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
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
