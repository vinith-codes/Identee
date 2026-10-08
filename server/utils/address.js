// Server copy of the address rules in frontend/src/utils/address.js —
// keep the two in sync. State deliverability is checked separately
// against the ShippingCost rules.
const RULES = {
  pin: /^[1-9]\d{5}$/,
  phone: /^[6-9]\d{9}$/,
  city: /^[A-Za-z][A-Za-z .'-]{1,49}$/,
};

const str = (v) => String(v ?? "").trim();

// Returns the first problem as a human-readable message, or null if valid.
export const addressProblem = (addr = {}) => {
  if (!str(addr.doorNo)) return "Door / house number is required";
  if (str(addr.doorNo).length > 50) return "Door / house number is too long";
  if (str(addr.street).length < 3 || str(addr.street).length > 100)
    return "Enter a valid street / area";
  if (str(addr.nearestLandmark).length > 100) return "Landmark is too long";
  if (!RULES.city.test(str(addr.city))) return "Enter a valid city (letters only)";
  if (!str(addr.state)) return "State is required";
  if (!RULES.pin.test(str(addr.pin))) return "Enter a valid 6-digit PIN code";
  if (!RULES.phone.test(str(addr.phoneNumber)))
    return "Enter a valid 10-digit mobile number";
  return null;
};
