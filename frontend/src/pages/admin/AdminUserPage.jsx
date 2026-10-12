import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { fetchUsers, removeUser } from "../../redux/slices/userManagementSlice";
import { toast } from "react-toastify";

const COLORS = ["#2563eb", "#10b981", "#f59e0b"]; // with orders, without orders, admin

const AdminUsersPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { users, loading, actionLoading } = useSelector(
    (state) => state.userManagement,
  );

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => u.isAdmin).length;
    const withOrders = users.filter((u) => (u.orderCount || 0) > 0).length;
    const withoutOrders = total - withOrders;

    return { total, admins, withOrders, withoutOrders };
  }, [users]);

  const pieData = [
    { name: "Users with Orders", value: stats.withOrders },
    { name: "Users without Orders", value: stats.withoutOrders },
    { name: "Admin Users", value: stats.admins },
  ];

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`))
      return;
    try {
      await dispatch(removeUser(id)).unwrap();
      toast.success("User deleted");
    } catch (err) {
      toast.error(err || "Failed to delete user");
    }
  };

  const { error } = useSelector((state) => state.userManagement);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading users...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-400">
        Error loading users: {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 text-white">
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "#141110" }}>Customers</h1>

      {/* Pie chart */}
      <div className="bg-[#11141f] rounded-xl p-6 mb-6" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={110}
            >
              {pieData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#11141f] rounded-xl p-5">
          <p className="text-sm text-gray-400">Total Users</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-[#11141f] rounded-xl p-5">
          <p className="text-sm text-gray-400">Users with Orders</p>
          <p className="text-2xl font-bold text-blue-400">{stats.withOrders}</p>
        </div>
        <div className="bg-[#11141f] rounded-xl p-5">
          <p className="text-sm text-gray-400">Users without Orders</p>
          <p className="text-2xl font-bold text-red-400">
            {stats.withoutOrders}
          </p>
        </div>
        <div className="bg-[#11141f] rounded-xl p-5">
          <p className="text-sm text-gray-400">Admin Users</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.admins}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#11141f] rounded-xl overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-700">
              <th className="p-4">Profile</th>
              <th className="p-4">Name</th>
              <th className="p-4">Subscription</th>
              <th className="p-4">Admin</th>
              <th className="p-4">Seller</th>
              <th className="p-4">Orders</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="border-b border-gray-800">
                <td className="p-4">
                  <div className="w-9 h-9 rounded-full bg-purple-700 flex items-center justify-center font-bold">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                </td>
                <td className="p-4">{user.name}</td>
                <td className="p-4 text-gray-400">
                  {user.isSubscribed ? "Subscribed" : "Not Subscribed"}
                </td>
                <td
                  className={`p-4 font-semibold ${
                    user.isAdmin ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {user.isAdmin ? "YES" : "NO"}
                </td>
                <td
                  className={`p-4 font-semibold ${
                    user.isSeller ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {user.isSeller ? "YES" : "NO"}
                </td>
                <td className="p-4">
                  <span className="bg-purple-600 text-xs px-3 py-1 rounded-full">
                    {user.orderCount || 0} Orders
                  </span>
                </td>
                <td className="p-4 space-x-2">
                  <button
                    onClick={() => navigate(`/admin/users/${user._id}`)}
                    className="bg-teal-500 text-xs px-3 py-1.5 rounded-md"
                  >
                    VIEW
                  </button>
                  <button
                    onClick={() => navigate(`/admin/users/${user._id}/edit`)}
                    className="bg-blue-600 text-xs px-3 py-1.5 rounded-md"
                  >
                    EDIT
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleDelete(user._id, user.name)}
                    className="bg-red-600 text-xs px-3 py-1.5 rounded-md disabled:opacity-50"
                  >
                    DELETE
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUsersPage;
