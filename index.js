const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = 3000;
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(express.json());
app.use(cors());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

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
    const contestsCollection = naimsDb.collection("allContests");
    const contestsSubmission = naimsDb.collection("contestSubmission");
    const registrationsCollection = naimsDb.collection("contentRegistrations");

    // role middlewares
    const verifyAdmin = async (req, res, next) => {
      const email = req.userEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "admin")
        return res
          .status(403)
          .send({ message: "Admin only Actions!", role: user?.role });
      next();
    };

    const verifyCreator = async (req, res, next) => {
      const email = req.userEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "creator")
        return res
          .status(403)
          .send({ message: "Seller only Actions!", role: user?.role });
      next();
    };

    app.get("/", async (req, res) => {
      const docs = await contestsCollection.find({}).toArray();
      res.send(docs);
    });

    //User related API
    app.get("/users", verifyJWT, async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/top-users", async (req, res) => {
      const cursor = usersCollection.find().sort({ totalWon: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email", verifyJWT, async (req, res) => {
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

    app.patch("/users/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updatedUser = req.body;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          ...updatedUser,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Contests related API
    app.get("/contests", async (req, res) => {
      const search = req.query.search;
      const query = {};
      if (search) {
        query.category = { $regex: search, $options: "i" };
      }
      const cursor = contestsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/contests/email/:email", async (req, res) => {
      const email = req.params.email;
      const query = {};
      if (email) {
        query.creatorEmail = email;
      }
      const cursor = contestsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/contests/winner/:email", async (req, res) => {
      const email = req.params.email;
      const query = {};
      if (email) {
        query.winnerEmail = email;
      }
      const cursor = contestsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/contest-categories", async (req, res) => {
      const contests = await contestsCollection
        .find({ status: "approved" }, { projection: { category: 1, _id: 0 } })
        .toArray();

      // Extract strings and remove duplicates
      const uniqueCategories = [...new Set(contests.map((c) => c.category))];

      res.send(uniqueCategories);
    });

    app.get("/contests/type/:status", async (req, res) => {
      const { search, category, sort } = req.query;

      let query = { status: "approved" };
      if (search) {
        query.name = { $regex: search, $options: "i" };
      }
      if (category) {
        query.category = category;
      }

      let sortOptions = {};
      if (sort === "newest") sortOptions = { createdAt: -1 };
      if (sort === "participants") sortOptions = { participants: -1 };
      if (sort === "prize") sortOptions = { prizeMoney: -1 };

      const result = await contestsCollection
        .find(query)
        .sort(sortOptions)
        .toArray();

      res.send(result);
    });

    app.post("/contests", verifyJWT, verifyCreator, async (req, res) => {
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

    app.patch("/contests/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...status,
        },
      };
      const result = await contestsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/contests/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const result = await contestsCollection.deleteOne(filter);
      res.send(result);
    });

    app.get("/registrations/check/:contestId", verifyJWT, async (req, res) => {
      try {
        const contestId = req.params.contestId;
        const userEmail = req.userEmail;

        // 1️⃣ Find user by email
        const user = await usersCollection.findOne({ email: userEmail });
        if (!user) {
          return res.status(404).send({ registered: false });
        }

        // 2️⃣ Check registration
        const registration = await registrationsCollection.findOne({
          userEmail: userEmail,
          contestId: contestId,
          paymentStatus: "paid",
        });
        console.log("registration", registration);
        // 3️⃣ Send result
        if (registration) {
          return res.send({ registered: true });
        } else {
          return res.send({ registered: false });
        }
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // user task submitted api
    app.get("/participate-contest/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = {};
      if (email) {
        query.userEmail = email;
      }
      const result = await registrationsCollection
        .find(query)
        .sort({ registeredAt: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/submissions/:email", verifyJWT, async (req, res) => {
      const { email } = req.params;
      const query = {};
      if (email) {
        query.creatorEmail = email;
      }
      const result = await contestsSubmission.find(query).toArray();
      res.send(result);
    });

    app.post("/submissions", verifyJWT, async (req, res) => {
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
              unit_amount: paymentInfo.price,
              product_data: {
                name: `${paymentInfo.creator_name}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          contestId: paymentInfo.contestId,
          userEmail: paymentInfo.userEmail,
          deadline: paymentInfo.deadline,
          title: paymentInfo.title,
          name: paymentInfo.name,
        },
        customer_email: paymentInfo.userEmail,
        mode: "payment",

        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancel`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const transactionId = session.payment_intent;

        //  Prevent duplicate registration
        const exists = await registrationsCollection.findOne({ transactionId });
        if (exists) return res.send({ message: "Already processed" });

        if (session.payment_status === "paid") {
          // 1️⃣ Save registration
          await registrationsCollection.insertOne({
            userEmail: session.customer_email,
            contestId: session.metadata.contestId,
            name: session.metadata.name,
            title: session.metadata.title,
            deadline: session.metadata.deadline,
            transactionId,
            sessionId: session.id,
            amount: session.amount_total,
            paymentStatus: "paid",
            registeredAt: new Date(),
          });

          const query = {
            _id: new ObjectId(session.metadata.contestId),
          };

          // update user paricipated
          const userPariticipatedUpdate = await usersCollection.updateOne(
            { email: session.customer_email },
            { $inc: { totalParticipated: 1 } }
          );
          // update contest collection
          const contestUpdateresult = await contestsCollection.updateOne(
            query,
            { $inc: { participants: 1 } }
          );
          return res.send({ contestId: session.metadata.contestId });
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
