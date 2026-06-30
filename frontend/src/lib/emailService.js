import emailjs from '@emailjs/browser';

const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

/**
 * Sends a bilingual (DE/AR) confirmation email to the new sponsor.
 * Silently fails – registration is already saved regardless.
 */
export async function sendConfirmationEmail({ name, email, sqMeters, monthlyAmount }) {
    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
        console.warn('EmailJS env vars missing – skipping confirmation email.');
        return;
    }

    const logoUrl = `${window.location.origin}/logo_white_bg.png`;

    try {
        await emailjs.send(
            SERVICE_ID,
            TEMPLATE_ID,
            {
                to_name:       name,
                to_email:      email,
                sq_meters:     sqMeters,
                monthly_amount: monthlyAmount.toFixed(2),
                logo_url:      logoUrl,
            },
            { publicKey: PUBLIC_KEY },
        );
    } catch (err) {
        console.error('Confirmation email failed (non-critical):', err);
    }
}
