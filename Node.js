import cors from "cors";
app.use(cors({
  origin: "*", // or specify your frontend URL
  methods: ["GET", "POST"],
}));
