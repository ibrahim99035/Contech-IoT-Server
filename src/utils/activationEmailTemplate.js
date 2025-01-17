module.exports = (user, activationToken) => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
        <h2 style="color: #4CAF50; text-align: center;">Activate Your Email</h2>
        <p style="font-size: 16px; color: #333;">Dear ${user.name || 'User'},</p>
        <p style="font-size: 16px; color: #333;">Click the button below to activate your email. The link will expire in 1 hour.</p>
        <a href="${process.env.FRONTEND_URL}/activate-email/${activationToken}" 
           style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #4CAF50; color: #fff; text-decoration: none; border-radius: 5px;">
          Activate Email
        </a>
        <p style="font-size: 16px; color: #333; margin-top: 20px;">If you did not request this, please ignore this email.</p>
        <p style="font-size: 16px; color: #333;">Best Regards,<br/>The Team</p>
      </div>
    `;
};  