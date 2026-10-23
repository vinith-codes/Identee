// Admins and sellers work on the admin website (admin.identee.co.in); the shop (identee.co.in) is for customers
// (23 Oct 2026). A delivery person has no pages on the admin website, so they count as a customer here.
export const isTeamAccount = (user) => !!(user && (user.isAdmin || user.isSeller));
