const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const serviceAccount = require("./admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }
  const idToken = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

async function run() {
  try {
    // await client.connect();
    const db = client.db("blood-center");
    const userCollection = db.collection("users");
    const donationRequestsCollection = db.collection("donationRequests");
    const blogCollection = db.collection("blogs");
    const fundingsCollection = db.collection("fundings");

    // Role middlewares
    const verifyAdmin = async (req, res, next) => {
      const user = await userCollection.findOne({ email: req.firebaseUser.email });
      if (user.role === "admin") next();
      else res.status(403).send({ msg: "unauthorized" });
    };
    const verifyVolunteerOrAdmin = async (req, res, next) => {
      const user = await userCollection.findOne({ email: req.firebaseUser.email });
      if (user.role === "admin" || user.role === "volunteer") next();
      else res.status(403).send({ msg: "unauthorized" });
    };

    // --- User APIs ---
    app.post("/add-user", async (req, res) => {
      try {
        const { name, email, photo, blood_group, district, upazila, role, status } = req.body;
        if (!name || !email || !photo || !blood_group || !district || !upazila) {
          return res.status(400).json({ message: "Missing required fields" });
        }
        const existing = await userCollection.findOne({ email });
        if (existing) return res.status(409).json({ message: "User already exists" });
        const user = {
          name, email, photo, blood_group, district, upazila,
          role: role || "donor", status: status || "active", createdAt: new Date(),
        };
        const result = await userCollection.insertOne(user);
        res.status(201).json({ message: "User registered", userId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    app.get("/user-profile", verifyFirebaseToken, async (req, res) => {
      const user = await userCollection.findOne({ email: req.firebaseUser.email });
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    });

    // Get user role in authprovider
    app.get("/get-user-role", verifyFirebaseToken, async (req, res) => {
      const user = await userCollection.findOne({
        email: req.firebaseUser.email,
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.send({
        msg: "ok",
        role: user.role,
        status: user.status,
      });
    });

    app.patch("/users/:id", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const update = req.body;
      delete update._id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
      );
      res.json(result);
    });

    // --- Donation Requests APIs ---
    app.post("/donation-requests", async (req, res) => {
      try {
        const {
          requesterName, requesterEmail, recipientName, recipientDistrict,
          recipientUpazila, hospitalName, addressLine, bloodGroup,
          donationDate, donationTime, requestMessage,
        } = req.body;
        const doc = {
          requesterName, requesterEmail, recipientName, recipientDistrict,
          recipientUpazila, hospitalName, addressLine, bloodGroup,
          donationDate, donationTime, requestMessage,
          donationStatus: "pending", createdAt: new Date(), donorInfo: null,
        };
        const result = await donationRequestsCollection.insertOne(doc);
        res.status(201).json({ message: "Donation request created", id: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    app.get("/donation-requests/recent", async (req, res) => {
      const { email } = req.query;
      const requests = await donationRequestsCollection
        .find({ requesterEmail: email })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();
      res.json(requests);
    });

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


// GET /search-donation-requests?blood_group=B-&district=Brahmanbaria&upazila=Kasba
// app.get("/search-donation-requests", async (req, res) => {
//   const { blood_group, district, upazila } = req.query;
//   const query = {};
//   if (blood_group) query.bloodGroup = blood_group;
//   if (district) query.recipientDistrict = district;
//   if (upazila) query.recipientUpazila = upazila;
//   // Optionally, only show pending or available requests:
//   // query.donationStatus = "pending";
//   const requests = await donationRequestsCollection.find(query).toArray();
//   res.json(requests);
// });


// GET /search-donation-requests?blood_group=B-&district=Brahmanbaria&upazila=Kasba
app.get("/search-donation-requests", async (req, res) => {
  const { blood_group, district, upazila } = req.query;
  const query = { donationStatus: "pending" }; // Only pending
  if (blood_group) query.bloodGroup = blood_group;
  if (district) query.recipientDistrict = district;
  if (upazila) query.recipientUpazila = upazila;
  const requests = await donationRequestsCollection.find(query).toArray();
  res.json(requests);
});


// PATCH /donation-requests/:id/confirm-donation
app.patch("/donation-requests/:id/confirm-donation", verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  console.log(id)
  const { donorName, donorEmail } = req.body;
  // Add donor info as an array (for multiple donors)
  console.log(req.body);
  const request = await donationRequestsCollection.findOne({ _id: new ObjectId(id) });
  let donorInfo = Array.isArray(request.donorInfo) ? request.donorInfo : [];

  donorInfo.push({ name: donorName, email: donorEmail, confirmedAt: new Date() });
  console.log(donorInfo);
  const result = await donationRequestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { donationStatus: "inprogress", donorInfo } }
  );
  console.log(result);
  res.json(result);
});





    app.get("/donation-requests/:id", async (req, res) => {
      const { id } = req.params;
      const request = await donationRequestsCollection.findOne({ _id: new ObjectId(id) });
      res.json(request);
    });

    // --- Admin/Volunteer APIs ---

    // GET /admin-dashboard-stats
app.get("/admin-dashboard-stats", verifyFirebaseToken, async (req, res) => {
  // Total users (donor/volunteer)
  const totalUsers = await userCollection.countDocuments({ role: { $in: ["donor", "volunteer"] } });

  // Total funding (sum of all time)
  const totalFundingAgg = await db.collection("fundings").aggregate([
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray();
  const totalFunding = totalFundingAgg[0]?.total || 0;

  // Total donation requests
  const totalRequests = await donationRequestsCollection.countDocuments();

  res.json({
    totalUsers,
    totalFunding,
    totalRequests,
  });
});

    app.get("/admin/donation-requests", verifyFirebaseToken, verifyVolunteerOrAdmin, async (req, res) => {
      const { status = "all", page = 1, limit = 10 } = req.query;
      const query = {};
      if (status !== "all") query.donationStatus = status;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await donationRequestsCollection.countDocuments(query);
      const requests = await donationRequestsCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).toArray();
      res.json({ requests, total });
    });

    // PATCH donation status (volunteer or admin)
    app.patch("/donation-requests/:id/status", verifyFirebaseToken, verifyVolunteerOrAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const result = await donationRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { donationStatus: status } }
      );
      res.json(result);
    });

    // DELETE donation request (admin only)
    // app.delete("/donation-requests/:id", verifyFirebaseToken, verifyAdmin, async (req, res) => {
    //   const { id } = req.params;
    //   const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(id) });
    //   res.json(result);
    // });


    // DELETE donation request (admin or owner)
app.delete("/donation-requests/:id", verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const user = await userCollection.findOne({ email: req.firebaseUser.email });
  const request = await donationRequestsCollection.findOne({ _id: new ObjectId(id) });

  // Only allow if admin or the requester
  if (
    user.role === "admin" ||
    (request && request.requesterEmail === req.firebaseUser.email)
  ) {
    const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(id) });
    return res.json(result);
  } else {
    return res.status(403).json({ message: "Unauthorized" });
  }
});

    // PATCH donation request (edit) (admin only)
    app.patch("/donation-requests/:id", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const update = req.body;
      delete update._id;
      const result = await donationRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
      );
      res.json(result);
    });

    // --- Blog APIs ---
    app.post("/blogs", verifyFirebaseToken, verifyVolunteerOrAdmin, async (req, res) => {
      const { title, thumbnail, content } = req.body;
      const blog = {
        title, thumbnail, content, status: "draft", createdAt: new Date(),
      };
      const result = await blogCollection.insertOne(blog);
      res.status(201).json({ message: "Blog created", id: result.insertedId });
    });

    app.get("/blogs", verifyFirebaseToken, async (req, res) => {
      const { status = "all" } = req.query;
      const query = {};
      if (status !== "all") query.status = status;
      const blogs = await blogCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.json(blogs);
    });

    // PATCH blog status (admin only)
    app.patch("/blogs/:id/status", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const result = await blogCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.json(result);
    });

    // DELETE blog (admin only)
    app.delete("/blogs/:id", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // --- Users APIs ---
    app.get("/users", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const { page = 1, limit = 10, status = "all", email } = req.query;
      const query = {};
      if (status !== "all") query.status = status;
      if (email) query.email = email;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await userCollection.countDocuments(query);
      const users = await userCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();
      res.json({ users, total });
    });

    app.patch("/users/:id/status", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.json(result);
    });

    app.patch("/users/:id/role", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.json(result);
    });



    // POST /create-payment-intent 
app.post("/create-payment-intent", verifyFirebaseToken, async (req, res) => {
  const { amount } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Stripe expects cents
      currency: "usd",
      payment_method_types: ["card"],
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /fundings (save funding after payment)
app.post("/fundings", verifyFirebaseToken, async (req, res) => {
  const { amount } = req.body;
  const user = await userCollection.findOne({ email: req.firebaseUser.email });
  const doc = {
    userId: user._id,
    name: user.name,
    email: user.email,
    amount,
    createdAt: new Date(),
  };
  const result = await db.collection("fundings").insertOne(doc);
  res.status(201).json({ message: "Funding saved", id: result.insertedId });
});

// GET /fundings (paginated, for admin/volunteer)
app.get("/fundings", verifyFirebaseToken, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await db.collection("fundings").countDocuments();
  const fundings = await db.collection("fundings")
    .find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .toArray();
  res.json({ fundings, total });
});


//-------------------------------GET /live-counts--------------------------------------
app.get("/live-counts", async (req, res) => {
  try {
    const totalDonors = await userCollection.countDocuments({ role: "donor", status: "active" });
    const totalVolunteers = await userCollection.countDocuments({ role: "volunteer", status: "active" });

    // Use your fundings collection here:
    const totalFundingAgg = await fundingsCollection.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).toArray();
    const totalFunding = totalFundingAgg[0]?.total || 0;

    const totalRequests = await donationRequestsCollection.countDocuments();
    const totalSuccessfulDonations = await donationRequestsCollection.countDocuments({ donationStatus: "done" });

    res.json({
      totalDonors,
      totalVolunteers,
      totalFunding,
      totalRequests,
      totalSuccessfulDonations,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});




    console.log("connected");
  } finally { }
}

run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send({ msg: "hello" });
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});