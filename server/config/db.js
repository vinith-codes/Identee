import mongoose from "mongoose";
import dotenv from "dotenv";
import chalk from "chalk";

dotenv.config();
// import colors from "colors";

// a mongoose stuf (mongoose.connect ....) return always a promise
// the database connection dropping and coming back, in the log (13 Nov 2026)
mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));
mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected"));

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI;

    // console.log(
    //   "MONGO_URI:",
    //   process.env.MONGO_URI
    // ); // Debugging line
    
    
    const conn = await mongoose.connect(MONGO_URI);
    console.log("MongoDB Connected");
    console.log(chalk.yellow(`Database Name: ${conn.connection.name}`));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
export default connectDB;
