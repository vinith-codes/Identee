// "₹1,299" — Indian digit grouping
export const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
