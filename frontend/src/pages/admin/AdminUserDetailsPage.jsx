import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { fetchUserById, clearSelectedUser } from "../../redux/slices/Usermanagementslice";

const AdminUserDetailsPage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { selectedUser, loading } = useSelector((state) => state.userManagement);

  useEffect(() => {
    dispatch(fetchUserById(id));
    return () => dispatch(clearSelectedUser());
  }, [dispatch, id]);

  const close = () => navigate("/admin/users");

  if (loading || !selectedUser) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, textAlign: "center", color: "#6B6559" }}>
          Loading user...
        </div>
      </div>
    );
  }

  const user = selectedUser;
  const initial = user.name?.charAt(0).toUpperCase() || "?";
  const addr = user.addresses?.find((a) => a.isDefault) || user.addresses?.[0];

  return (
    <div style={overlayStyle} onClick={close}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#141110" }}>
            User Details
          </h2>
          <button
            onClick={close}
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#141110" }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "24px 0" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#6b21a8",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#141110" }}>
              {user.name}
            </p>
            <p style={{ margin: 0, color: "#6B6559", fontSize: 14 }}>{user.email}</p>
          </div>
        </div>

        <hr style={hrStyle} />

        <div style={{ padding: "14px 0" }}>
          <p style={rowStyle}>
            <strong>Admin:</strong> {user.isAdmin ? "Yes" : "No"}
          </p>
          <p style={rowStyle}>
            <strong>Seller:</strong> {user.isSeller ? "Yes" : "No"}
          </p>
        </div>

        <hr style={hrStyle} />

        <div style={{ padding: "14px 0" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "#141110" }}>
            Subscription
          </p>
          <p style={{ margin: 0, color: "#6B6559" }}>
            {user.isSubscribed ? user.subscription?.title || "Subscribed" : "Not Subscribed"}
          </p>
        </div>

        <hr style={hrStyle} />

        <div style={{ padding: "14px 0" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "#141110" }}>
            Address
          </p>
          {addr ? (
            <p style={{ margin: 0, color: "#6B6559" }}>
              {[addr.doorNo, addr.street, addr.city, addr.state, addr.pin]
                .filter(Boolean)
                .join(", ")}
            </p>
          ) : (
            <p style={{ margin: 0, color: "#6B6559" }}>No Address Provided</p>
          )}
        </div>

        <hr style={hrStyle} />

        <p style={{ margin: "14px 0 0", fontWeight: 700, color: "#141110" }}>
          Total Orders: {user.orderCount || 0}
        </p>
      </div>
    </div>
  );
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  padding: 20,
};

const cardStyle = {
  background: "#FFFFFF",
  borderRadius: 16,
  padding: 28,
  width: "100%",
  maxWidth: 420,
  maxHeight: "85vh",
  overflowY: "auto",
  fontFamily: "'Inter', sans-serif",
};

const hrStyle = { border: "none", borderTop: "1px solid #EAE3CF", margin: 0 };

const rowStyle = { margin: "6px 0", color: "#141110", fontSize: 15 };

export default AdminUserDetailsPage;