const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  ChangeStream,
} = require("mongodb");

var admin = require("firebase-admin");

var serviceAccount = require("./admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// const serviceAccount = require("./admin-key.json");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("🚀 ~ verifyFirebaseToken ~ authHeader:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decodedToken; // You can access user info like uid, email, etc.
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid token from catch" });
  }
};

async function run() {
  try {
    await client.connect();
    const db = client.db("blood-center");
    const userCollection = db.collection("users");
    const donationRequestsCollection = db.collection("donationRequests");

    const verifyAdmin = async (req, res, next) => {
      const user = await userCollection.findOne({
        email: req.firebaseUser.email,
      });

      if (user.role === "admin") {
        next();
      } else {
        res.status(403).send({ msg: "unauthorized" });
      }
    };


    // Add user endpoint
    app.post("/add-user", async (req, res) => {
      try {
        const { name, email, photo, blood_group, district, upazila, role, status } = req.body;

        if (!name || !email || !photo || !blood_group || !district || !upazila) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        // Check if user already exists
        const existing = await userCollection.findOne({ email });
        if (existing) {
          return res.status(409).json({ message: "User already exists" });
        }

        // Insert new user
        const user = {
          name,
          email,
          photo,
          blood_group,
          district,
          upazila,
          role: role || "donor",
          status: status || "active",
          createdAt: new Date(),
        };

        const result = await userCollection.insertOne(user);
        res.status(201).json({ message: "User registered", userId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });



   
 

    app.get("/get-user-role", verifyFirebaseToken, async (req, res) => {
      console.log("🚀 ~ get-user-role ~ req.firebaseUser:", req.firebaseUser);
      const user = await userCollection.findOne({
        email: req.firebaseUser.email,
      });
      res.send({ msg: "ok", role: user.role, status: "active" });
    });

    app.get(
      "/get-users",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const users = await userCollection
          .find({ email: { $ne: req.firebaseUser.email } })
          .toArray();
        res.send(users);
      }
    );

    app.patch(
      "/update-role",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const { email, role } = req.body;
        const result = await userCollection.updateOne(
          { email: email },
          {
            $set: { role },
          }
        );

        res.send(result);
      }
    );



    // ---------------------------------------------------------------------------dashboard api--------------------------------------------------------------

// Create donation request
app.post("/donation-requests", async (req, res) => {
  try {
    const {
      requesterName,
      requesterEmail,
      recipientName,
      recipientDistrict,
      recipientUpazila,
      hospitalName,
      addressLine,
      bloodGroup,
      donationDate,
      donationTime,
      requestMessage,
    } = req.body;

    // Only allow active users (you can check user status here if you want)
    // const user = await userCollection.findOne({ email: requesterEmail });
    // if (!user || user.status !== "active") {
    //   return res.status(403).json({ message: "User is not active" });
    // }

    const doc = {
      requesterName,
      requesterEmail,
      recipientName,
      recipientDistrict,
      recipientUpazila,
      hospitalName,
      addressLine,
      bloodGroup,
      donationDate,
      donationTime,
      requestMessage,
      donationStatus: "pending", 
      createdAt: new Date(),
      donorInfo: null, // will be filled when inprogress
    };
    const result = await donationRequestsCollection.insertOne(doc);
    res.status(201).json({ message: "Donation request created", id: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get recent 3 donation requests for a donor
app.get("/donation-requests/recent", async (req, res) => {
  const { email } = req.query;
  const requests = await donationRequestsCollection
    .find({ requesterEmail: email })
    .sort({ createdAt: -1 })
    .limit(3)
    .toArray();
  res.json(requests);
});

// Get all donation requests for a donor (with optional status filter & pagination)
app.get("/donation-requests", async (req, res) => {
  const { email, status, page = 1, limit = 10 } = req.query;
  const query = { requesterEmail: email };
  if (status && status !== "all") query.donationStatus = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await donationRequestsCollection.countDocuments(query);
  const requests = await donationRequestsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .toArray();
  res.json({ requests, total });
});

// Update donation request (edit)
app.patch("/donation-requests/:id", async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  delete update._id; // never update _id
  const result = await donationRequestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: update }
  );
  res.json(result);
});

// Delete donation request
app.delete("/donation-requests/:id", async (req, res) => {
  const { id } = req.params;
  const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});

// Get single donation request (details)
app.get("/donation-requests/:id", async (req, res) => {
  const { id } = req.params;
  const request = await donationRequestsCollection.findOne({ _id: new ObjectId(id) });
  res.json(request);
});

   

  

    


  // ----------------------------------------------------------------- admin api-------------------------------------------------------------------------


  // Get admin dashboard stats
app.get("/admin-dashboard-stats", async (req, res) => {
  const userCount = await userCollection.countDocuments({ role: { $in: ["donor", "volunteer"] } });
  const totalFunding = await db.collection("fundings").aggregate([
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray();
  const donationRequestCount = await donationRequestsCollection.countDocuments();
  res.json({
    totalUsers: userCount,
    totalFunding: totalFunding[0]?.total || 0,
    totalRequests: donationRequestCount,
  });
});

// Get all users (with pagination and status filter)
app.get("/users", async (req, res) => {
  const { page = 1, limit = 10, status = "all" } = req.query;
  const query = {};
  if (status !== "all") query.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await userCollection.countDocuments(query);
  const users = await userCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();
  res.json({ users, total });
});

// Update user status (block/unblock)
app.patch("/users/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await userCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );
  res.json(result);
});

// Update user role (make volunteer/admin)
app.patch("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const result = await userCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } }
  );
  res.json(result);
});

// Get all donation requests (admin)
app.get("/admin/donation-requests", async (req, res) => {
  const { status = "all", page = 1, limit = 10 } = req.query;
  const query = {};
  if (status !== "all") query.donationStatus = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await donationRequestsCollection.countDocuments(query);
  const requests = await donationRequestsCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray();
  res.json({ requests, total });
});

// Update donation request status (done/canceled)
app.patch("/donation-requests/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await donationRequestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { donationStatus: status } }
  );
  res.json(result);
});

// Blog endpoints
const blogCollection = db.collection("blogs");

// Add blog
app.post("/blogs", async (req, res) => {
  const { title, thumbnail, content } = req.body;
  const blog = {
    title,
    thumbnail,
    content,
    status: "draft",
    createdAt: new Date(),
  };
  const result = await blogCollection.insertOne(blog);
  res.status(201).json({ message: "Blog created", id: result.insertedId });
});

// Get blogs (with status filter)
app.get("/blogs", async (req, res) => {
  const { status = "all" } = req.query;
  const query = {};
  if (status !== "all") query.status = status;
  const blogs = await blogCollection.find(query).sort({ createdAt: -1 }).toArray();
  res.json(blogs);
});

// Publish/unpublish blog
app.patch("/blogs/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await blogCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );
  res.json(result);
});

// Delete blog
app.delete("/blogs/:id", async (req, res) => {
  const { id } = req.params;
  const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});



// Real Stat Changes for Admin Dashboard

app.get("/admin-dashboard-stats", async (req, res) => {
  // Dates for this month and last month
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const firstDayThisMonthStr = firstDayThisMonth.toISOString();
  const firstDayLastMonthStr = firstDayLastMonth.toISOString();

  // Total users (donor/volunteer)
  const totalUsers = await userCollection.countDocuments({ role: { $in: ["donor", "volunteer"] } });
  const usersLastMonth = await userCollection.countDocuments({
    role: { $in: ["donor", "volunteer"] },
    createdAt: { $gte: firstDayLastMonth, $lt: firstDayThisMonth }
  });


  // Total funding (sum of all time and last month)
  const totalFundingAgg = await db.collection("fundings").aggregate([
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray();
  const totalFunding = totalFundingAgg[0]?.total || 0;
  const fundingLastMonthAgg = await db.collection("fundings").aggregate([
    { $match: { createdAt: { $gte: firstDayLastMonth, $lt: firstDayThisMonth } } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray();
  const fundingLastMonth = fundingLastMonthAgg[0]?.total || 0;

  // Total donation requests (all time and last month)
  const totalRequests = await donationRequestsCollection.countDocuments();
  const requestsLastMonth = await donationRequestsCollection.countDocuments({
    createdAt: { $gte: firstDayLastMonth, $lt: firstDayThisMonth }
  });

  // Calculate percentage changes
  function getChange(current, last) {
    if (last === 0) return current === 0 ? 0 : 100;
    return ((current - last) / last * 100).toFixed(1);
  }

  res.json({
    totalUsers,
    usersLastMonth,
    usersChange: getChange(totalUsers, usersLastMonth),
    totalFunding,
    fundingLastMonth,
    fundingChange: getChange(totalFunding, fundingLastMonth),
    totalRequests,
    requestsLastMonth,
    requestsChange: getChange(totalRequests, requestsLastMonth),
  });
});










    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100, // in cents (e.g., 500 = $5.00)
          currency: "usd",
          payment_method_types: ["card"],

        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log("connected");
  } finally {
  }
}

run().catch(console.dir);

// Root route
app.get("/", async (req, res) => {
  res.send({ msg: "hello" });
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

/*
1. authorization
*/
