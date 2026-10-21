import nodemailer from 'nodemailer';

const mailHost = () => process.env.MAIL_HOST || 'smtp.gmail.com';
const mailUser = () => process.env.MAIL_USER || '';
const mailFrom = () => process.env.MAIL_FROM || `Zyngram Campus Hub <${mailUser()}>`;

export function invitationMailConfigured() {
  return Boolean(process.env.MAIL_PASSWORD && mailHost() && mailUser() && mailFrom());
}

export async function sendInvitationEmail({ email, name, invitationUrl }) {
  await sendMail({
    email,
    subject: 'Set up your Zyngram Campus Hub account',
    text: `Hello ${name},\n\nAn account has been created for you at Zyngram Campus Hub. Set your password using this one-time link, which expires in 48 hours:\n\n${invitationUrl}\n\nIf you were not expecting this invitation, contact your campus administrator.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p>An account has been created for you at Zyngram Campus Hub.</p><p><a href="${escapeHtml(invitationUrl)}">Set up your account</a>. This one-time link expires in 48 hours.</p><p>If you were not expecting this invitation, contact your campus administrator.</p>`
  });
}

export async function sendPasswordResetEmail({ email, name, resetUrl }) {
  await sendMail({
    email,
    subject: 'Reset your Zyngram Campus Hub password',
    text: `Hello ${name},\n\nUse this one-time link to reset your Zyngram Campus Hub password. It expires in one hour:\n\n${resetUrl}\n\nIf you did not request this reset, you can ignore this email.`,
    html: `<p>Hello ${escapeHtml(name)},</p><p><a href="${escapeHtml(resetUrl)}">Reset your Zyngram Campus Hub password</a>. This one-time link expires in one hour.</p><p>If you did not request this reset, you can ignore this email.</p>`
  });
}

export async function sendStudentRegistrationNotification({ adminEmail, name, email, cohort, requestId }) {
  await sendMail({
    email: adminEmail,
    subject: 'Student access request needs your review',
    text: `A student has requested access to Zyngram Campus Hub.\n\nName: ${name}\nEmail: ${email}\nCohort: ${cohort}\nRequest ID: ${requestId}\n\nSign in to Campus Hub, open User management, and approve or reject the request. The student cannot access the portal until approved.`,
    html: `<p>A student has requested access to Zyngram Campus Hub.</p><ul><li>Name: ${escapeHtml(name)}</li><li>Email: ${escapeHtml(email)}</li><li>Cohort: ${escapeHtml(cohort)}</li><li>Request ID: ${escapeHtml(requestId)}</li></ul><p>Sign in to Campus Hub and open User management to approve or reject the request. The student cannot access the portal until approved.</p>`
  });
}

async function sendMail({ email, subject, text, html }) {
  if (!invitationMailConfigured()) {
    throw new Error('Email delivery is not configured. Set MAIL_PASSWORD in .env or provide complete SMTP settings.');
  }

  const port = Number(process.env.MAIL_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MAIL_PORT must be a valid SMTP port.');
  }

  const transport = nodemailer.createTransport({
    host: mailHost(),
    port,
    secure: process.env.MAIL_SECURE === 'true' || port === 465,
    auth: { user: mailUser(), pass: process.env.MAIL_PASSWORD },
    connectionTimeout: 10000,
    socketTimeout: 20000
  });
  try {
    await transport.sendMail({
      from: mailFrom(),
      to: email,
      subject,
      text,
      html
    });
  } finally {
    transport.close();
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
