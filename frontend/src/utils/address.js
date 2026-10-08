// Address validation + autofill helpers shared by checkout (AddressStep)
// and the Account page. Validation rules are mirrored on the server in
// server/utils/address.js — keep the two in sync.

export const ADDRESS_RULES = {
  pin: /^[1-9]\d{5}$/, // Indian PIN: 6 digits, can't start with 0
  phone: /^[6-9]\d{9}$/, // Indian mobile: 10 digits starting 6-9
  city: /^[A-Za-z][A-Za-z .'-]{1,49}$/, // letters, spaces, . ' -
};

const findState = (state, deliverableStates) =>
  deliverableStates.find(
    (s) => s.trim().toLowerCase() === String(state || "").trim().toLowerCase(),
  );

// Returns { field: message } — empty object when the address is valid.
// deliverableStates: state names from the shipping rules (skip the check if empty).
export const validateAddress = (addr, deliverableStates = []) => {
  const errs = {};
  const str = (v) => String(v ?? "").trim();

  if (!str(addr.doorNo)) errs.doorNo = "Required";
  else if (str(addr.doorNo).length > 50) errs.doorNo = "Too long";

  if (str(addr.street).length < 3) errs.street = "Enter the street / area";
  else if (str(addr.street).length > 100) errs.street = "Too long";

  if (str(addr.nearestLandmark).length > 100) errs.nearestLandmark = "Too long";

  if (!str(addr.city)) errs.city = "Required";
  else if (!ADDRESS_RULES.city.test(str(addr.city)))
    errs.city = "Use letters only (e.g. Chennai)";

  if (!str(addr.state)) errs.state = "Required";
  else if (deliverableStates.length && !findState(addr.state, deliverableStates))
    errs.state = "We don't deliver to this state yet";

  if (!str(addr.pin)) errs.pin = "Required";
  else if (!ADDRESS_RULES.pin.test(str(addr.pin)))
    errs.pin = "Enter a valid 6-digit PIN";

  if (!str(addr.phoneNumber)) errs.phoneNumber = "Required";
  else if (!ADDRESS_RULES.phone.test(str(addr.phoneNumber)))
    errs.phoneNumber = "Enter a valid 10-digit mobile number";

  return errs;
};

export const isValidAddress = (addr, deliverableStates = []) =>
  Object.keys(validateAddress(addr || {}, deliverableStates)).length === 0;

// Matches a looked-up state name to the exact spelling used in shipping
// rules ("tamil nadu" -> "Tamil Nadu"); returns "" if not deliverable.
export const matchDeliverableState = (state, deliverableStates) =>
  findState(state, deliverableStates) || "";

/* ---------------- PIN -> city / state (India Post, free) ---------------- */

const pinCache = new Map();

// Returns { city, state } or null. City = district, which is what most
// people expect for the "City" field (e.g. 600001 -> Chennai, Tamil Nadu).
export const lookupPincode = async (pin) => {
  if (!ADDRESS_RULES.pin.test(String(pin))) return null;
  if (pinCache.has(pin)) return pinCache.get(pin);
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    const office = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
    const result = office ? { city: office.District, state: office.State } : null;
    pinCache.set(pin, result);
    return result;
  } catch {
    return null;
  }
};

/* ---------------- Current location (browser GPS + OpenStreetMap) ---------------- */

const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location isn't supported on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(
        new Error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Please allow it or type the address."
            : "Couldn't get your location. Please type the address.",
        ),
      );
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });

// Uses the device location to pre-fill an address. The user still checks it
// and fills the door number (GPS can't know it). Returns a partial address.
export const addressFromCurrentLocation = async () => {
  const { coords } = await getPosition();
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1` +
    `&zoom=18&lat=${coords.latitude}&lon=${coords.longitude}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Couldn't look up your address. Please type it.");
  const a = (await res.json())?.address || {};

  const street = [a.road, a.neighbourhood || a.suburb].filter(Boolean).join(", ");
  return {
    doorNo: a.house_number || "",
    street,
    nearestLandmark: a.amenity || a.building || "",
    city: a.city || a.town || a.village || a.county || a.state_district || "",
    state: a.state || "",
    pin: (a.postcode || "").replace(/\s/g, ""),
  };
};
