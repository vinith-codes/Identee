import axios from "axios";
import { APP } from "../utils/siteUrls";
import { isTeamAccount } from "../utils/teamAccount";
import { forgetDesignRoom, makeRoom } from "../studio/chatStore";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const API_URL = `${BACKEND_URL}/api/users`;

const saveUser = (user) => {
  // the shop never keeps an admin/seller login (23 Oct 2026) — the login page sends them to the admin website
  // (a login marked testMode stays: Admin → Design Studio → Test as a customer, 5 Nov 2026)
  if (APP === "shop" && isTeamAccount(user) && !user.testMode) return user;
  keepUser(user);
  return user;
};

// The login is kept in this browser. A browser whose storage is full (13 Nov 2026: the design room keeps whole chats)
// must not block logging in: the design rooms’ kept copies make way (their chats are safe in Chats; designs stay).
function keepUser(user) {
  try {
    localStorage.setItem("userInfo", JSON.stringify(user));
  } catch {
    makeRoom();
    try {
      localStorage.setItem("userInfo", JSON.stringify(user));
    } catch {
      /* storage blocked: logged in until the page is closed */
    }
  }
}

// OTP LOGIN — step 1: send a code to an email or mobile number
const requestOtp = async (identifier) => {
  const response = await axios.post(`${API_URL}/otp/request`, { identifier });
  return response.data;
};

// OTP LOGIN — step 2: returns the logged-in user, or
// { needsProfile, signupToken } for a new account
const verifyOtp = async (identifier, otp) => {
  const response = await axios.post(`${API_URL}/otp/verify`, { identifier, otp });
  if (response.data?.token) saveUser(response.data);
  return response.data;
};

// OTP LOGIN — step 3 (new users only): create the account
const completeSignup = async (signupToken, name) => {
  const response = await axios.post(`${API_URL}/otp/complete`, { signupToken, name });
  return saveUser(response.data);
};

// GET PROFILE
const getProfile = async (token) => {
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  const response = await axios.get(`${API_URL}/profile`, config);

  return response.data;
};

// UPDATE PROFILE
const updateProfile = async (profileData, token) => {
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      // "Content-Type": "multipart/form-data",
    },
  };

  const response = await axios.put(`${API_URL}/profile`, profileData, config);

  keepUser(response.data);

  return response.data;
};

// LOGOUT
const logout = () => {
  localStorage.removeItem("userInfo");
  forgetDesignRoom(); // (13 Nov 2026) the design room and chats left in this browser go too
};

const authService = {
  requestOtp,
  verifyOtp,
  completeSignup,
  logout,
  getProfile,
  updateProfile,
};

export default authService;
