// studio/StudioRoute.jsx — /customize/:type
// The 3D Design Room when the garment has a 3D model and the device can show
// 3D; otherwise the classic flat studio (with the site menu).
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import Navbar from "../components/Navbar";
import CustomizePage from "../pages/CustomizePage";
import DesignRoomPage from "./DesignRoomPage";
import { hasWebGL } from "./webgl";
import { modelForGarment } from "./teeModel";

const webgl = typeof window !== "undefined" && hasWebGL();

export default function StudioRoute() {
  const { type } = useParams();
  const dispatch = useDispatch();
  const { items: garments } = useSelector((s) => s.garmentType);
  useEffect(() => {
    dispatch(fetchGarmentTypes());
  }, [dispatch]);
  const garment = garments.find((g) => g.key === type);
  const flat = !webgl || (garment && !modelForGarment(garment));
  if (flat) {
    return (
      <>
        <Navbar />
        <CustomizePage />
      </>
    );
  }
  return <DesignRoomPage />;
}
