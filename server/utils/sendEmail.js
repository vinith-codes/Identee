import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ email, status, order, invoice, attachments }) => {
  // Users who signed up with a mobile number have no email on file.
  if (!email) return;

  status = status.toUpperCase();

  // INVOICE emails carry their own PDF and don't need the order-status
  // product table — handle them separately so we don't touch
  // order.orderItems.product (which isn't populated on this call path).
  if (status === "INVOICE") {
    const mailOptions = {
      from: `"IDENTEE" <${process.env.EMAIL_USER}>`,
      to: email,
      cc: process.env.ADMIN_EMAIL,
      subject: `Your IDENTEE Invoice ${invoice?.invoiceNumber || ""}`,
      html: `
        <div style="font-family:Arial, sans-serif; max-width:600px; margin:auto;">
          <h2 style="color:#8A6F2E;">Your Invoice is Ready</h2>
          <p>Hi ${invoice?.customer?.name || "there"},</p>
          <p>
            Please find attached the invoice
            <strong>${invoice?.invoiceNumber || ""}</strong>
            for order <strong>${invoice?.orderNumber || ""}</strong>,
            totalling <strong>₹${invoice?.pricing?.totalPrice ?? ""}</strong>.
          </p>
          <p style="color:gray; font-size:12px;">
            Thank you for shopping with IDENTEE ❤️
          </p>
        </div>
      `,
      attachments: attachments || [],
    };

    await transporter.sendMail(mailOptions);
    return;
  }

  console.log("📨 sendEmail entered");
  console.log("📧 Email:", email);
  console.log("📌 Status:", status);
  if (!order || !order.orderItems || order.orderItems.length === 0) {
    throw new Error("Invalid order data for email");
  }

  let subject = "";

  switch (status) {
    case "ORDERED":
      subject = "🛒 Order Placed Successfully";
      break;

    case "PACKED":
      subject = "📦 Your Order is Packed";
      break;

    case "OUT_FOR_DELIVERY":
    case "SHIPPED":
      console.log("🚚 DISPATCH mail triggered");
      subject = "🚚 Order Dispatched";
      break;

    case "DELIVERED":
      subject = "🎉 Order Delivered";
      break;

    default:
      subject = "📢 Order Update";
  }
  const BASE_URL = process.env.BACKEND_URL;
  const productRows = order.orderItems
    .map((item) => {
      // Custom-design items have no product document (and may have no image).
      const imagePath = item.product?.images?.[0] || item.image;

      const imageUrl = !imagePath
        ? ""
        : imagePath.startsWith("http")
          ? imagePath
          : `${BASE_URL}/${imagePath.replace(/\\/g, "/")}`;
      return `
      <tr>
        <td style="padding:10px">
          ${imageUrl ? `<img src="${imageUrl}" width="80" style="border-radius:6px" />` : ""}
        </td>
        <td style="padding:10px">
          <strong>${item.name}</strong><br/>
          Size: ${item.size}<br/>
          Qty: ${item.qty}
        </td>
        <td style="padding:10px">
          Rs. ${item.price}
        </td>
      </tr>
    `;
    })
    .join("");
  const itemsPrice = order.orderItems.reduce(
    (acc, item) => acc + item.price * item.qty,
    0,
  );

  const mailOptions = {
    from: `"IDENTEE" <${process.env.EMAIL_USER}>`,
    to: email,
    cc: process.env.ADMIN_EMAIL,
    subject,
    html: `
      <div style="font-family:Arial, sans-serif; max-width:600px; margin:auto;">
        <h2 style="color:#d63384;">Order Status: ${status}</h2>
        <p><b>Order ID:</b> ${order._id}</p>

        <table width="100%" border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#f8f8f8;">
              <th align="left" style="padding:10px;">Product</th>
              <th align="left" style="padding:10px;">Details</th>
              <th align="left" style="padding:10px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>

        <h3 style="margin-top:20px;">Order Summary</h3>
       <p>Items: Rs. ${itemsPrice}</p>

        <p>Shipping: Rs. ${order.shippingPrice}</p>
        <p>Tax: Rs. ${order.taxPrice}</p>
        <h2>Total: Rs. ${order.totalPrice}</h2>

        <p style="margin-top:20px;">
          📦 Shipping to:<br/>
          ${order.shippingAddress.city}, ${order.shippingAddress.state}
        </p>

        <p style="color:gray; font-size:12px;">
          Thank you for shopping with us ❤️
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export default sendEmail;
