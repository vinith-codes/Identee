// utils/sessionExpiry.js
//
// A saved login stops working after 30 days (server/utils/generateToken.js), or when the account is deleted or the
// server's JWT_SECRET changes. The backend then answers "Not authorized, token failed" (401) — and the website used
// to go on LOOKING logged in while every action failed. Now: the first such answer logs out cleanly (as Sign out
// does) and opens the login page with a short note; after logging in, the customer is taken back to where they
// were. Designs being made are kept: the Design Room keeps them in this browser, not in the login.
// (Only that exact answer counts — "no token", a wrong code at login, "not an admin" are not an expired login.)

const EXPIRED = /not authorized, token failed/i;
let handled = false;

const hasLogin = () => {
  try {
    return Boolean(JSON.parse(localStorage.getItem("userInfo") || "null")?.token);
  } catch {
    return false;
  }
};

export function loginExpired() {
  if (handled || !hasLogin()) return;
  handled = true;
  try {
    localStorage.removeItem("userInfo");
  } catch {
    // (storage blocked: the login page still opens)
  }
  if (window.location.pathname === "/login") return;
  const back = window.location.pathname + window.location.search;
  window.location.assign(`/login?expired=1&next=${encodeURIComponent(back)}`);
}

const isExpiredAnswer = (status, message) => status === 401 && EXPIRED.test(String(message || ""));

/**
 * Watches every answer from the backend: axios (all the axios instances given) and fetch (a few pages use it).
 * @param axiosInstances  e.g. [axios, api, img]
 * @param backendUrl      the backend's address (fetch calls to other sites are ignored)
 */
export function watchForExpiredLogin(axiosInstances, backendUrl) {
  for (const inst of axiosInstances) {
    inst.interceptors.response.use(
      (res) => res,
      (err) => {
        if (isExpiredAnswer(err?.response?.status, err?.response?.data?.message)) loginExpired();
        return Promise.reject(err);
      },
    );
  }
  const original = window.fetch?.bind(window);
  if (!original) return;
  window.fetch = async (...args) => {
    const res = await original(...args);
    if (res.status === 401) {
      const url = String(args[0]?.url || args[0] || "");
      if (url.startsWith(backendUrl)) {
        res
          .clone()
          .json()
          .then((body) => isExpiredAnswer(401, body?.message) && loginExpired())
          .catch(() => {});
      }
    }
    return res;
  };
}
