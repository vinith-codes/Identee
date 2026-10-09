// utils/productAccess.js
//
// Who may change a ready-made product: an admin may change any product, a
// seller only the products they added (product.user).
import Product from "../models/productModel.js";

const forbidden = () =>
  Object.assign(new Error("You can only change products you added"), { status: 403 });

export const canManage = (user, product) =>
  !!user && (user.isAdmin || String(product.user) === String(user._id));

// Throws 403 unless the user may change this product.
export const assertCanManage = (user, product) => {
  if (!canManage(user, product)) throw forbidden();
};

// Throws 403 unless the user may change every colour in the group.
export const assertCanManageGroup = async (user, groupId) => {
  if (user?.isAdmin) return;
  const other = await Product.exists({ productGroupId: groupId, user: { $ne: user?._id } });
  if (other) throw forbidden();
};

// Mongo filter: the products this user may manage.
export const manageableFilter = (user) => (user?.isAdmin ? {} : { user: user?._id });
