import Order, { LIVE_ORDERS } from "../models/orderModel.js";
import asyncHandler from "express-async-handler";
// Helper function to filter data by time
const filterByTime = (orders, filter) => {
  const now = new Date();
  return orders.filter((order) => {
    const orderDate = new Date(order.createdAt);
    switch (filter) {
      case "Day":
        return orderDate.toDateString() === now.toDateString(); // Same day
      case "Week":
        const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));
        return orderDate >= oneWeekAgo;
      case "Month":
        return (
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        ); // Same month and year
      case "Year":
        return orderDate.getFullYear() === now.getFullYear(); // Same year
      default:
        return true; // No filter
    }
  });
};

// @desc Get sales data
// @route GET /api/dashboard/sales
// @access Private/Admin
const getSalesData = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const orders = await Order.find(LIVE_ORDERS);
  const filteredOrders = filterByTime(orders, filter);

  const salesData = filteredOrders.map((order) => ({
    label: new Date(order.createdAt).toLocaleDateString(),
    value: order.orderItems.reduce((acc, item) => acc + item.qty, 0), // Total products sold
  }));

  res.json(salesData);
});

// @desc Get revenue data
// @route GET /api/dashboard/revenue
// @access Private/Admin
const getRevenueData = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const orders = await Order.find(LIVE_ORDERS);
  const filteredOrders = filterByTime(orders, filter);

  const revenueData = filteredOrders.map((order) => ({
    label: new Date(order.createdAt).toLocaleDateString(),
    value: order.totalPrice,
  }));

  res.json(revenueData);
});

// @desc Get total orders
// @route GET /api/dashboard/totalOrders
// @access Private/Admin
const getTotalOrders = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const orders = await Order.find(LIVE_ORDERS);
  const filteredOrders = filterByTime(orders, filter);
  const totalOrdersCount = filteredOrders.length;
  res.json(totalOrdersCount);
});
// @desc Get latest orders
// @route GET /api/dashboard/orders
// @access Private/Admin
// const getLatestOrders = asyncHandler(async (req, res) => {
//   const orders = await Order.find({})
//     .sort({ createdAt: -1 })
//     .limit(10)
//     .populate("user", "name email createdAt")
//     .populate({
//       path: "orderItems.product",
//       select: "name images price", // Select the images field
// });
//   const latestOrders = orders.map((order) => ({
//     _id: order._id,
//     customerName: order.user.name,
//     total: order.totalPrice,
//     status: getOrderStatus(order),
//     createdAt: order.createdAt
//       ? new Date(order.createdAt).toLocaleDateString()
//       : "N/A",
//     paidAt: order.paidAt ? new Date(order.paidAt).toLocaleDateString() : "N/A", // Add payment date if needed
//     orderItems: order.orderItems.map((item) => ({
//       productName: item.product.name,
//       productImage: item.product.images,
//       productPrice: item.product.price,
//       quantity: item.quantity,
//       productId: item.product._id, // Make sure productId is added if you need it
//     })),
//   }));

//   res.json(latestOrders);
// });

// Function to get order status

const getLatestOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find(LIVE_ORDERS)
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("user", "name email createdAt")
    .populate({
      path: "orderItems.product",
      select: "name images price",
    });

  const latestOrders = orders.map((order) => ({
    _id: order._id,
    customerName: order.user?.name || "Unknown",
    total: order.totalPrice,
    status: getOrderStatus(order),
    createdAt: order.createdAt
      ? new Date(order.createdAt).toLocaleDateString()
      : "N/A",
    paidAt: order.paidAt ? new Date(order.paidAt).toLocaleDateString() : "N/A",
    orderItems: order.orderItems.map((item) => ({
      productName: item.product?.name || "Deleted Product",
      productImage: item.product?.images || [],
      productPrice: item.product?.price || 0,
      quantity: item.quantity,
      productId: item.product?._id || null,
    })),
  }));

  res.json(latestOrders);
});

const getOrderStatus = (order) => {
  if (order.isReturned) {
    return { label: "Returned", color: "red" };
  } else if (order.isDelivered) {
    return { label: "Delivered", color: "green" };
  } else if (order.isPacked) {
    return { label: "Packed", color: "orange" };
  } else if (order.isAcceptedByDelivery) {
    return { label: "Shipped", color: "blue" };
  } else {
    return { label: "Ordered", color: "gray" };
  }
};

const getTopCustomers = asyncHandler(async (req, res) => {
  const topCustomers = await Order.aggregate([
    { $match: LIVE_ORDERS },
    {
      $group: {
        _id: "$user",
        totalOrders: { $sum: 1 },
      },
    },
    { $sort: { totalOrders: -1 } },
    { $limit: 6 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: "$user._id",
        name: "$user.name",
        profilePicture: "$user.profilePicture",
        totalOrders: 1,
      },
    },
  ]);

  res.json(topCustomers);
});

export { getSalesData, getRevenueData, getLatestOrders, getTotalOrders,getTopCustomers };
