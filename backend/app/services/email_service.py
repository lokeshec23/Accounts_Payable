import os
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

load_dotenv()

logger = logging.getLogger("app")

# Base HTML Template for all emails
BASE_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
        .header {{ background-color: #1a3353; color: white; padding: 25px; text-align: center; }}
        .content {{ padding: 30px; background-color: #ffffff; border: 1px solid #eee; }}
        .footer {{ background-color: #f4f4f4; color: #777; padding: 15px; text-align: center; font-size: 12px; }}
        .otp-box {{ background-color: #f1f8fc; border: 2px dashed #1a3353; padding: 20px; font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 5px; color: #1a3353; margin: 25px 0; border-radius: 8px; }}
        .highlight {{ color: #1a3353; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{title}</h1>
    </div>
    <div class="content">
        <p>Dear {name},</p>
        <div style="font-size: 16px;">
            {body}
        </div>
        {action_section}
        <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            If you did not request this, please ignore this email or contact support.
        </p>
        <p>Best regards,<br>The APEX Team</p>
    </div>
    <div class="footer">
        &copy; {year} APEX. All rights reserved.<br>
        Automated notification - do not reply.
    </div>
</body>
</html>
"""

class EmailService:
    @staticmethod
    def send_email(to_email: str, subject: str, title: str, name: str, body: str, action_text: str = None, is_otp: bool = False):
        try:
            msg = MIMEMultipart()
            msg['From'] = os.getenv("EMAIL_USER")
            msg['To'] = to_email
            msg['Subject'] = subject

            # Only show OTP box, remove button links as per requirement
            action_section = ""
            if is_otp and action_text:
                action_section = f'<div class="otp-box">{action_text}</div>'

            from datetime import datetime
            html_content = BASE_TEMPLATE.format(
                title=title,
                name=name,
                body=body,
                action_section=action_section,
                year=datetime.now().year
            )

            msg.attach(MIMEText(html_content, 'html'))

            smtp_server = os.getenv("SMTP_SERVER")
            smtp_port = int(os.getenv("SMTP_PORT"))
            email_user = os.getenv("EMAIL_USER")
            email_pass = os.getenv("EMAIL_PASS")

            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(email_user, email_pass)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Error sending email to {to_email}: {e}")
            return False

    @classmethod
    def send_registration_otp(cls, email: str, otp: str):
        return cls.send_email(
            to_email=email,
            subject="Verification Code for Registration - APEX",
            title="Account Verification",
            name="User",
            body="Use the following OTP to complete your registration process. This code is valid for 5 minutes.",
            action_text=otp,
            is_otp=True
        )

    @classmethod
    def send_forgot_password_otp(cls, email: str, username: str, otp: str):
        return cls.send_email(
            to_email=email,
            subject="Verification Code for Password Reset - APEX",
            title="Password Reset Request",
            name=username,
            body="We received a request to reset your password. Use the following OTP to proceed.",
            action_text=otp,
            is_otp=True
        )

    @classmethod
    def send_admin_new_user_notification(cls, admin_email: str, user_email: str, username: str):
        return cls.send_email(
            to_email=admin_email,
            subject="Action Required: New User Registration - APEX",
            title="New User Alert",
            name="Administrator",
            body=f"A new user <span class='highlight'>{username}</span> ({user_email}) has registered and is pending approval."
        )

    @classmethod
    def send_user_pending_approval(cls, email: str, username: str):
        return cls.send_email(
            to_email=email,
            subject="Registration Successful - Pending Approval - APEX",
            title="Registration Received",
            name=username,
            body="Your email has already registered. Your account is currently <span class='highlight'>waiting for admins approval</span>. You will be notified via email once your account is active."
        )

    @classmethod
    def send_approval_notification(cls, email: str, username: str, role: str):
        return cls.send_email(
            to_email=email,
            subject="Welcome to APEX! Account Approved",
            title="Account Activated",
            name=username,
            body=f"Your account has been approved by the administrator. You have been assigned the role: <span class='highlight'>{role}</span>. You can now log in to the system."
        )

    @classmethod
    def send_approval_request_email(cls, email: str, username: str, vendor_name: str, invoice_number: str, amount: str, currency: str):
        body = f"""
        An invoice requires your approval:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Amount:</span> {amount} {currency}
        <br><br>
        Please log in to the APEX portal to review and take action.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Approval Required: Invoice {invoice_number} from {vendor_name}",
            title="Invoice Approval Request",
            name=username,
            body=body
        )

    @classmethod
    def send_rejection_notification(cls, email: str, username: str, vendor_name: str, invoice_number: str, status: str, comment: str):
        status_label = "Rejected" if status.lower() == "rejected" else "Rework"
        body = f"""
        Your submitted invoice has been <span class='highlight'>{status_label}</span>:
        <br><br>
        <span class='highlight'>Vendor:</span> {vendor_name}<br>
        <span class='highlight'>Invoice #:</span> {invoice_number}<br>
        <span class='highlight'>Approver Comment:</span> {comment or "No comment provided."}
        <br><br>
        Please log in to the APEX portal to review and address the issues.
        """
        return cls.send_email(
            to_email=email,
            subject=f"Action Required: Invoice {invoice_number} {status_label}",
            title=f"Invoice {status_label}",
            name=username,
            body=body
        )



email_service = EmailService()
