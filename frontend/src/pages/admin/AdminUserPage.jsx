// pages/admin/AdminUserPage.jsx
//
// Admin → Customers: everyone with an account, what they are allowed to do
// (admin, seller, delivery) and how many orders they placed. Search by name,
// email or phone; open one to view, change their access, or delete them.
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { fetchUsers, removeUser } from "../../redux/slices/Usermanagementslice";
import userService from "../../services/userService";
import { AW } from "./garmentSetup/wizardStyles";

const FILTERS = [
  ["all", "Everyone"],
  ["ordered", "Have ordered"],
  ["new", "No orders yet"],
  ["team", "Admins & staff"],
];

const CSS = `
  .cu-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
  .cu-tile { padding: 18px 20px; }
  .cu-tile span { display: block; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #8A7A55; }
  .cu-tile b { display: block; margin-top: 6px; font: 800 30px/1 'Inter', sans-serif; letter-spacing: -0.02em; color: #141110; font-variant-numeric: tabular-nums; }
  .cu-tile small { display: block; margin-top: 6px; font-size: 12.5px; color: #6B6559; }
  .cu-share { height: 6px; border-radius: 999px; background: #F0EADB; margin-top: 12px; overflow: hidden; }
  .cu-share i { display: block; height: 100%; border-radius: 999px; background: #C9A24B; }
  .cu-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 22px; }
  .cu-search { flex: 1 1 260px; max-width: 380px; }
  .cu-chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .cu-wrap { margin-top: 14px; overflow-x: auto; }
  .cu-table { border-collapse: collapse; width: 100%; min-width: 760px; font-size: 14px; }
  .cu-table th { text-align: left; padding: 14px 18px; font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #8A7A55; border-bottom: 1px solid #EFE7D4; white-space: nowrap; }
  .cu-table td { padding: 14px 18px; border-bottom: 1px solid #F3EDDD; vertical-align: middle; }
  .cu-table tr:last-child td { border-bottom: 0; }
  .cu-table tbody tr { transition: background-color .15s; }
  .cu-table tbody tr:hover { background: #FDFAF2; }
  .cu-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .cu-av { width: 40px; height: 40px; border-radius: 50%; flex: none; display: grid; place-items: center; background: #F4E7C4; color: #7A5B12; font: 700 15px 'Inter', sans-serif; object-fit: cover; }
  .cu-name { font-weight: 700; color: #141110; }
  .cu-sub { font-size: 12.5px; color: #6B6559; margin-top: 1px; overflow-wrap: anywhere; }
  .cu-you { margin-left: 8px; font-size: 11px; font-weight: 800; color: #7A5B12; }
  .cu-roles { display: flex; gap: 6px; flex-wrap: wrap; }
  .cu-role { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; letter-spacing: .03em; white-space: nowrap; }
  .cu-role.admin { background: #141110; color: #F2D48A; }
  .cu-role.seller { background: #E6EEF9; color: #23457A; }
  .cu-role.delivery { background: #E3F2E8; color: #24522F; }
  .cu-role.plain { background: #F3EEE2; color: #6B5A36; }
  .cu-num { font-variant-numeric: tabular-nums; font-weight: 700; }
  .cu-num.none { color: #A39C8C; font-weight: 500; }
  .cu-acts { display: flex; gap: 6px; justify-content: flex-end; white-space: nowrap; }
  .cu-act { border: 1px solid #D7CCB3; background: #fff; color: #141110; border-radius: 9px; padding: 7px 13px; font: 700 12.5px 'Inter', sans-serif; cursor: pointer; transition: border-color .15s, background-color .15s; }
  .cu-act:hover:not(:disabled) { border-color: #141110; }
  .cu-act.del { border-color: transparent; background: none; color: #B42318; }
  .cu-act.del:hover:not(:disabled) { background: #FEECEA; }
  .cu-act:disabled { opacity: .45; cursor: not-allowed; }
  .cu-empty { padding: 44px 20px; text-align: center; color: #6B6559; }
  .cu-add { margin-top: 22px; padding: 18px 20px; display: grid; gap: 12px; }
  .cu-add h2 { margin: 0; font: 700 16px 'Inter', sans-serif; color: #141110; }
  .cu-add p { margin: 0; font-size: 13px; color: #6B6559; line-height: 1.5; }
  .cu-addrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  .cu-addrow label { display: grid; gap: 6px; font-size: 12.5px; font-weight: 700; color: #3B342B; flex: 1 1 200px; min-width: 0; }
  .cu-addrow label.role { flex: 0 1 190px; }
  .cu-addrow .aw-inp { width: 100%; box-sizing: border-box; }
  .cu-addacts { display: flex; gap: 8px; flex-wrap: wrap; }
  .cu-count { margin: 12px 2px 0; font-size: 12.5px; color: #6B6559; }
  @media (max-width: 900px) { .cu-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

const joined = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

const AdminUsersPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { users, loading, actionLoading, error } = useSelector((state) => state.userManagement);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  // "Add an admin" (by email): the box, what is typed, and whether it is being sent
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState({ email: "", name: "", role: "admin" });
  const [adding, setAdding] = useState(false);
  // the admin looking at this page (their own row can't be deleted)
  const myId = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("userInfo") || "{}")._id || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const stats = useMemo(() => {
    const total = users.length;
    const ordered = users.filter((u) => (u.orderCount || 0) > 0).length;
    return {
      total,
      ordered,
      fresh: total - ordered,
      admins: users.filter((u) => u.isAdmin).length,
      orders: users.reduce((n, u) => n + (u.orderCount || 0), 0),
    };
  }, [users]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => {
        if (filter === "ordered" && !(u.orderCount > 0)) return false;
        if (filter === "new" && u.orderCount > 0) return false;
        if (filter === "team" && !(u.isAdmin || u.isSeller || u.isDelivery)) return false;
        return !q || [u.name, u.email, u.phone].some((v) => String(v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [users, query, filter]);

  const ROLE_LABEL = { admin: "an admin", seller: "a seller", delivery: "a delivery person" };
  const handleAdd = async (e) => {
    e.preventDefault();
    const email = add.email.trim();
    if (!email) return;
    const ask =
      add.role === "admin"
        ? `Give ${email} full admin access?\n\nThey'll be able to see and change everything here: orders, customers, products, prices and other admins.`
        : `Make ${email} ${ROLE_LABEL[add.role]}?`;
    if (!window.confirm(ask)) return;
    setAdding(true);
    try {
      const token = JSON.parse(localStorage.getItem("userInfo") || "{}")?.token;
      const res = await userService.addTeamMember({ email, name: add.name.trim(), role: add.role }, token);
      toast.success(res.message, { autoClose: res.emailed ? 6000 : 12000 });
      setAdd({ email: "", name: "", role: "admin" });
      setAddOpen(false);
      dispatch(fetchUsers()); // the list shows them straight away
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't add them. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (user) => {
    const who = user.name || user.email || user.phone || "this person";
    const orders = user.orderCount || 0;
    const kept = orders
      ? `\n\nTheir ${orders} order${orders === 1 ? " is" : "s are"} kept (with the name and address ${orders === 1 ? "it was" : "they were"} placed with), but they won't be able to log in, see ${orders === 1 ? "it" : "them"} or ask for a return.`
      : "";
    if (!window.confirm(`Delete ${who}'s account?${kept}\n\nThis cannot be undone.`)) return;
    try {
      await dispatch(removeUser(user._id)).unwrap();
      toast.success(orders ? `Account deleted — their ${orders} order${orders === 1 ? " is" : "s are"} kept.` : "Account deleted");
    } catch (err) {
      toast.error(err || "Could not delete the account");
    }
  };

  return (
    <div style={{ ...AW.page, padding: "8px 4px 40px" }}>
      <style>{AW.css + CSS}</style>
      <h1 style={AW.h1}>Customers</h1>
      <p style={AW.lead}>Everyone with an account. Open a person to see their orders or change what they are allowed to do.</p>

      {/* Add an admin (or a seller / delivery person) by email — also someone who has never logged in */}
      {addOpen ? (
        <form className="aw-card cu-add" onSubmit={handleAdd}>
          <h2>Add an admin by email</h2>
          <p>They don't need an account yet. They'll get an email, then log in at the website with this address — a code is sent to it, there's no password.</p>
          <div className="cu-addrow">
            <label>
              Email
              <input className="aw-inp" type="email" required autoFocus value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} placeholder="name@example.com" />
            </label>
            <label>
              Name (optional)
              <input className="aw-inp" value={add.name} maxLength={80} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="e.g. Priya" />
            </label>
            <label className="role">
              Access
              <select className="aw-inp" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
                <option value="admin">Admin (full access)</option>
                <option value="seller">Seller</option>
                <option value="delivery">Delivery person</option>
              </select>
            </label>
          </div>
          <div className="cu-addacts">
            <button type="submit" className="aw-btn dark" disabled={adding || !add.email.trim()}>
              {adding ? "Adding…" : "Add"}
            </button>
            <button type="button" className="aw-btn light" disabled={adding} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div style={{ marginTop: 18 }}>
          <button type="button" className="aw-btn gold" onClick={() => setAddOpen(true)}>
            + Add an admin
          </button>
        </div>
      )}

      {error ? (
        <div className="aw-card cu-empty" style={{ marginTop: 22, color: "#B42318" }}>Couldn’t load the customers: {error}</div>
      ) : loading && !users.length ? (
        <div className="aw-card cu-empty" style={{ marginTop: 22 }}>Loading customers…</div>
      ) : (
        <>
          <div className="cu-tiles">
            <div className="aw-card cu-tile">
              <span>Accounts</span>
              <b>{stats.total}</b>
              <small>{stats.orders} order{stats.orders === 1 ? "" : "s"} placed in all</small>
            </div>
            <div className="aw-card cu-tile">
              <span>Have ordered</span>
              <b>{stats.ordered}</b>
              <div className="cu-share" aria-hidden="true">
                <i style={{ width: `${stats.total ? (stats.ordered / stats.total) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="aw-card cu-tile">
              <span>No orders yet</span>
              <b>{stats.fresh}</b>
              <small>Signed up, not bought</small>
            </div>
            <div className="aw-card cu-tile">
              <span>Admins</span>
              <b>{stats.admins}</b>
              <small>Full access to this panel</small>
            </div>
          </div>

          <div className="cu-bar">
            <input
              className="aw-inp cu-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email or phone"
              aria-label="Search customers"
            />
            <div className="cu-chips" role="group" aria-label="Show">
              {FILTERS.map(([key, label]) => (
                <button key={key} type="button" className={`aw-chip${filter === key ? " on" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="aw-card cu-wrap">
            {shown.length ? (
              <table className="cu-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Access</th>
                    <th>Orders</th>
                    <th>Joined</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((user) => {
                    const name = user.name || "No name yet";
                    const me = user._id === myId;
                    const staff = user.isAdmin || user.isSeller || user.isDelivery;
                    return (
                      <tr key={user._id}>
                        <td>
                          <div className="cu-who">
                            <span className="cu-av" aria-hidden="true">{(user.name || user.email || "?").charAt(0).toUpperCase()}</span>
                            <div style={{ minWidth: 0 }}>
                              <div className="cu-name">
                                {name}
                                {me && <span className="cu-you">You</span>}
                              </div>
                              <div className="cu-sub">{user.email || user.phone || "No contact saved"}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="cu-roles">
                            {user.isAdmin && <span className="cu-role admin">Admin</span>}
                            {user.isSeller && <span className="cu-role seller">Seller</span>}
                            {user.isDelivery && <span className="cu-role delivery">Delivery</span>}
                            {!staff && <span className="cu-role plain">Customer</span>}
                          </div>
                        </td>
                        <td>
                          <span className={`cu-num${user.orderCount ? "" : " none"}`}>{user.orderCount || 0}</span>
                        </td>
                        <td style={{ color: "#6B6559", whiteSpace: "nowrap" }}>{joined(user.createdAt)}</td>
                        <td>
                          <div className="cu-acts">
                            <button type="button" className="cu-act" onClick={() => navigate(`/admin/users/${user._id}`)}>View</button>
                            <button type="button" className="cu-act" onClick={() => navigate(`/admin/users/${user._id}/edit`)}>Edit access</button>
                            <button
                              type="button"
                              className="cu-act del"
                              disabled={actionLoading || me || user.isAdmin}
                              title={me ? "You can’t delete your own account" : user.isAdmin ? "Remove their admin access first" : "Delete this account"}
                              onClick={() => handleDelete(user)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="cu-empty">{users.length ? "No one matches that search." : "No one has signed up yet."}</div>
            )}
          </div>
          {shown.length > 0 && (
            <p className="cu-count">
              Showing {shown.length} of {users.length}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AdminUsersPage;
