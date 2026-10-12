import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  fetchUserById,
  editUser,
  clearSelectedUser,
} from "../../redux/slices/userManagementSlice";

// Admin panel is dark-themed independently of the storefront theme.js
const ADMIN = {
  text: "#F3EFE6",
  textMuted: "#8A877F",
  border: "#2A2A30",
  inputBg: "#1A1A1F",
  gold: "#C9A24B",
  ink: "#141110",
};

const AdminEditUserPage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { selectedUser, loading, actionLoading } = useSelector(
    (state) => state.userManagement,
  );

  const [form, setForm] = useState({
    name: "",
    email: "",
    isAdmin: false,
    isSeller: false,
    isDelivery: false,
    hideUserManagement: false,
  });

  useEffect(() => {
    dispatch(fetchUserById(id));
    return () => dispatch(clearSelectedUser());
  }, [dispatch, id]);

  useEffect(() => {
    if (selectedUser) {
      setForm({
        name: selectedUser.name || "",
        email: selectedUser.email || "",
        isAdmin: !!selectedUser.isAdmin,
        isSeller: !!selectedUser.isSeller,
        isDelivery: !!selectedUser.isDelivery,
        hideUserManagement: !!selectedUser.hideUserManagement,
      });
    }
  }, [selectedUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // giving admin access is a big step: say what it means and ask once
    if (form.isAdmin && !selectedUser.isAdmin) {
      const ok = window.confirm(
        `Make ${form.name || form.email || "this person"} an admin?

They will be able to see every order and customer, change products and prices, and make or remove other admins.`,
      );
      if (!ok) return;
    }
    try {
      await dispatch(editUser({ id, userData: form })).unwrap();
      toast.success("User updated successfully");
      navigate("/admin/users");
    } catch (err) {
      toast.error(err || "Failed to update user");
    }
  };

  if (loading || !selectedUser) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: ADMIN.textMuted,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Loading user...
      </div>
    );
  }

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: ADMIN.textMuted,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 6,
  };

  const inputStyle = {
    width: "100%",
    background: ADMIN.inputBg,
    border: `1px solid ${ADMIN.border}`,
    borderRadius: 7,
    padding: "10px 14px",
    color: ADMIN.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const checkboxRow = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 2px",
    color: ADMIN.text,
    fontSize: 14,
  };

  const checkboxStyle = {
    width: 16,
    height: 16,
    accentColor: ADMIN.gold,
    cursor: "pointer",
  };

  return (
    <div style={{ padding: "40px 24px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 26,
            fontWeight: 600,
            color: ADMIN.text,
            borderBottom: `1px solid ${ADMIN.border}`,
            paddingBottom: 14,
            marginBottom: 26,
          }}
        >
          Edit User
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 18 }}
        >
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                name="isAdmin"
                checked={form.isAdmin}
                onChange={handleChange}
                style={checkboxStyle}
              />
              Promote as Admin
            </label>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                name="isSeller"
                checked={form.isSeller}
                onChange={handleChange}
                style={checkboxStyle}
              />
              Promote as Seller
            </label>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                name="isDelivery"
                checked={form.isDelivery}
                onChange={handleChange}
                style={checkboxStyle}
              />
              isDelivery
            </label>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                name="hideUserManagement"
                checked={form.hideUserManagement}
                onChange={handleChange}
                style={checkboxStyle}
              />
              Hide User Management
            </label>
          </div>

          <button
            type="submit"
            disabled={actionLoading}
            style={{
              width: "100%",
              background: ADMIN.gold,
              color: ADMIN.ink,
              border: "none",
              borderRadius: 999,
              padding: "13px 0",
              fontWeight: 700,
              cursor: actionLoading ? "not-allowed" : "pointer",
              opacity: actionLoading ? 0.6 : 1,
              letterSpacing: "0.04em",
            }}
          >
            {actionLoading ? "UPDATING..." : "UPDATE"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminEditUserPage;
