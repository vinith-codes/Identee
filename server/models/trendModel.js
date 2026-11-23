import mongoose from "mongoose";

// "Trending now" (23 Nov 2026): a look that is going round — "GTA style" first — that a customer's photo is redrawn
// in. The owner: "add the current trends as one feature — if the user uploads a photo it should give the GTA version
// of that". The team adds, edits and switches trends in Admin → Design Studio → Trends: no release needed for a new one.
//   name     what the customer sees ("GTA style")
//   look     the art look, in words, for the picture AI (it is told the look, not just a name: a picture AI can
//            refuse a request that only names a game or a film)
//   setting  the scene put behind the people for the "with the scene" picture
//   example  a picture of the result, for the home page card and the Design Room (one of our own uploads)
//   before   (optional) the photo the example was made from
// (23 Nov 2026, the owner: "only the black and [white] colours should be given. In the front side of the t-shirt the
// logo I am giving is fixed for all tees. In the back either they can make the GTA version of their photo or we should
// provide many options for the back.")
//   colours  the tee colours offered in this trend's studio (names as in the garment's colour list; none: all)
//   front    the picture put on the front of every tee of this trend (one of our uploads; none: the front is left
//            empty). The customer may still move, resize or remove it.
//   backs    ready-made pictures for the back, to pick instead of sending a photo: [{ url, name, small }]
//            (23 Nov 2026, the owner: "just download and show the image; while they order we can make it 4K and
//            enlarge with Topaz; once the image is made 4K after the order, replace the old one in the shop with it")
//            A back starts as a small downloaded picture. The first time one is ordered, Prepare for print makes its
//            4K copy — that copy then takes the picture's place (url), and the small picture's address is kept in
//            `small`, so a tee designed before the swap is recognised and uses the same copy (services/trends.js).
const trendSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    look: { type: String, required: true, trim: true, maxlength: 600 },
    setting: { type: String, default: "", trim: true, maxlength: 600 },
    example: { type: String, default: "" },
    before: { type: String, default: "" },
    colours: { type: [String], default: [] },
    front: { type: String, default: "" },
    backs: { type: [{ _id: false, url: { type: String, required: true }, name: { type: String, default: "", trim: true, maxlength: 40 }, small: { type: [String], default: [] } }], default: [] },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Trend = mongoose.model("Trend", trendSchema);
export default Trend;
