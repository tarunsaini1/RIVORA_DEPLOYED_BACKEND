
/**
 * Send invitation email to team members for project deployment
 * @param {Object} options - Email options
 * @param {string} options.recipientEmail - Email address of the recipient
 * @param {string} options.recipientName - Name of the recipient
 * @param {string} options.inviterName - Name of the person inviting
 * @param {string} options.projectName - Name of the project
 * @param {string} options.role - Role being offered (admin, member, viewer)
 * @param {string} options.message - Optional personal message
 * @param {string} options.invitationLink - Link to accept invitation
 * @returns {Promise} - Email sending result
 */
export const sendInvitationEmail = async ({
  recipientEmail,
  recipientName,
  inviterName,
  projectName,
  role,
  message,
  invitationLink
}) => {
  const subject = `Invitation to collaborate on "${projectName}"`;
  
  // Format the role for better readability
  const formattedRole = role.charAt(0).toUpperCase() + role.slice(1);
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">Project Collaboration Invitation</h2>
      
      <p>Hello ${recipientName || 'there'},</p>
      
      <p><strong>${inviterName}</strong> has invited you to collaborate on <strong>${projectName}</strong> as a <strong>${formattedRole}</strong>.</p>
      
      ${message ? `<div style="margin: 15px 0; padding: 10px; background-color: #f5f5f5; border-left: 4px solid #4f46e5; border-radius: 4px;">
        <p style="margin: 0;"><em>"${message}"</em></p>
      </div>` : ''}
      
      <p>This invitation was sent to you as part of a team deployment.</p>
      
      <div style="margin: 25px 0;">
        <a href="${invitationLink}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          View Invitation
        </a>
      </div>
      
      <p style="color: #666; font-size: 12px;">If you're not expecting this invitation or have questions, please contact ${inviterName} directly.</p>
    </div>
  `;

  return sendEmail({
    to: recipientEmail,
    subject,
    html: htmlContent
  });
};