const { SendMailClient } = require("zeptomail");
const logger = require("../utils/logger");

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS;
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Language Lab";

let client = null;

// Lazy init — lets the app boot even when Zoho isn't configured yet (e.g. local dev).
function getClient() {
  if (client) return client;
  if (!process.env.ZOHO_API_KEY || !FROM_ADDRESS) return null;

  client = new SendMailClient({
    url: process.env.ZOHO_API_URL || "api.zeptomail.in/",
    token: process.env.ZOHO_API_KEY,
  });
  return client;
}

const SEND_TIMEOUT_MS = 10_000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`ZeptoMail request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// zeptomail rejects with a parsed JSON error body (not an Error instance) on
// API failures, so error.message is usually empty — stringify whatever we got.
function describeError(error) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// Never throws — a failed/misconfigured email must not break the calling request.
async function sendMail({ to, toName, subject, html }) {
  try {
    const mailClient = getClient();
    if (!mailClient) {
      logger.warn(`Email skipped (ZOHO_API_KEY/EMAIL_FROM_ADDRESS not set): "${subject}" -> ${to}`);
      return false;
    }

    await withTimeout(
      mailClient.sendMail({
        from: { address: FROM_ADDRESS, name: FROM_NAME },
        to: [{ email_address: { address: to, name: toName || to } }],
        subject,
        htmlbody: html,
      }),
      SEND_TIMEOUT_MS,
    );

    logger.info(`Email sent: "${subject}" -> ${to}`);
    return true;
  } catch (error) {
    logger.error(`Email send failed ("${subject}" -> ${to}): ${describeError(error)}`);
    return false;
  }
}

function wrapTemplate({ title, bodyHtml }) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">
    <div style="padding:20px; background:#4338ca; color:#ffffff; text-align:center;">
      <h2 style="margin:0; font-size:20px;">${title}</h2>
    </div>
    <div style="padding:25px; color:#334155; font-size:14px; line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="padding:14px 20px; background:#f8fafc; border-top:1px solid #eef2f7; text-align:center; font-size:12px; color:#94a3b8;">
      This is an automated message from Language Lab — please do not reply.
    </div>
  </div>`;
}

// Sent once, right after a super admin creates an institute account.
async function sendInstituteCredentialsEmail(institute, plainPassword) {
  const loginUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/login` : null;

  const body = `
    <p>Dear <strong>${institute.institute_name}</strong>,</p>
    <p>Your institute account has been created on <strong>Language Lab</strong>. Here are your login credentials:</p>
    <div style="background:#f1f5f9; border-radius:8px; padding:16px; margin:20px 0;">
      <p style="margin:4px 0;"><strong>Institute Code:</strong> ${institute.institute_code}</p>
      <p style="margin:4px 0;"><strong>Email:</strong> ${institute.email}</p>
      <p style="margin:4px 0;"><strong>Password:</strong> ${plainPassword}</p>
    </div>
    <p>Please log in and change your password after your first login.</p>
    ${
      loginUrl
        ? `<p style="text-align:center; margin-top:20px;"><a href="${loginUrl}" style="background:#4338ca; color:#ffffff; padding:10px 20px; border-radius:6px; text-decoration:none;">Login to Language Lab</a></p>`
        : ""
    }
  `;

  return sendMail({
    to: institute.email,
    toName: institute.institute_name,
    subject: "Your Language Lab Institute Account Credentials",
    html: wrapTemplate({ title: "Welcome to Language Lab", bodyHtml: body }),
  });
}

// Sent once, right after courses/license seats are purchased (generated) for an institute.
async function sendLicensePurchaseEmail({ institute, courses = [], licenses = [] }) {
  const courseListHtml = courses.length
    ? `<ul style="padding-left:18px; margin:10px 0;">${courses
        .map((c) => `<li>${c.course_name}</li>`)
        .join("")}</ul>`
    : "";

  const seatsHtml = licenses
    .map(
      (l) => `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid #e2e8f0;">${l.license_code}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #e2e8f0;">${l.user_id}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #e2e8f0;">${l.password}</td>
    </tr>`,
    )
    .join("");

  const body = `
    <p>Dear <strong>${institute.institute_name}</strong>,</p>
    <p>Your license purchase has been processed successfully. You now have access to the following course(s):</p>
    ${courseListHtml}
    <p>Below are the seat login credentials generated for your institute:</p>
    <table style="width:100%; border-collapse:collapse; margin:14px 0; font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:6px 10px; text-align:left;">License Code</th>
          <th style="padding:6px 10px; text-align:left;">User ID</th>
          <th style="padding:6px 10px; text-align:left;">Password</th>
        </tr>
      </thead>
      <tbody>${seatsHtml}</tbody>
    </table>
    <p style="color:#b91c1c;"><strong>Important:</strong> These passwords are shown only once and cannot be retrieved again. Please store them securely.</p>
  `;

  return sendMail({
    to: institute.email,
    toName: institute.institute_name,
    subject: "Language Lab — License & Course Purchase Confirmation",
    html: wrapTemplate({ title: "Purchase Confirmation", bodyHtml: body }),
  });
}

// Sent when a super admin changes the set of courses assigned to an institute.
async function sendInstituteCourseAssignedEmail(institute, courses = []) {
  const courseListHtml = courses.length
    ? `<ul style="padding-left:18px; margin:10px 0;">${courses
        .map((c) => `<li>${c.course_name}</li>`)
        .join("")}</ul>`
    : "<p>No courses are currently assigned to your institute.</p>";

  const body = `
    <p>Dear <strong>${institute.institute_name}</strong>,</p>
    <p>The courses assigned to your institute on <strong>Language Lab</strong> have been updated. Your institute now has access to the following course(s):</p>
    ${courseListHtml}
  `;

  return sendMail({
    to: institute.email,
    toName: institute.institute_name,
    subject: "Language Lab — Course Assignment Updated",
    html: wrapTemplate({ title: "Course Assignment Updated", bodyHtml: body }),
  });
}

// Sent when an institute requests an OTP on the institute-code login flow (/config).
async function sendInstituteOtpEmail(institute, otp) {
  const body = `
    <p>Dear <strong>${institute.institute_name}</strong>,</p>
    <p>Use the code below to continue signing in to <strong>Language Lab</strong>:</p>
    <div style="background:#f1f5f9; border-radius:8px; padding:16px; margin:20px 0; text-align:center;">
      <span style="font-size:28px; font-weight:700; letter-spacing:6px; color:#4338ca;">${otp}</span>
    </div>
    <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
  `;

  return sendMail({
    to: institute.email,
    toName: institute.institute_name,
    subject: `${otp} is your Language Lab verification code`,
    html: wrapTemplate({ title: "Verification Code", bodyHtml: body }),
  });
}

module.exports = {
  sendMail,
  sendInstituteCredentialsEmail,
  sendLicensePurchaseEmail,
  sendInstituteCourseAssignedEmail,
  sendInstituteOtpEmail,
};
