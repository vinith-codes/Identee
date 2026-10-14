import { mailer, fromAddress } from "./mailer.js";

// (the shared email setup: utils/mailer.js)
const reviewnotificatioEmail = async ({ to, subject, text }) => {
  await mailer().sendMail({
    from: fromAddress("IDENTEE reviews"),
    to,
    subject,
    text,
  });
};

export default reviewnotificatioEmail;
