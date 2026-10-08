import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const API_URL = `${BACKEND_URL}/api/users`;

const saveUser = (user) => {
  localStorage.setItem("userInfo", JSON.stringify(user));
  return user;
};

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

  localStorage.setItem("userInfo", JSON.stringify(response.data));

  return response.data;
};

// LOGOUT
const logout = () => {
  localStorage.removeItem("userInfo");
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
