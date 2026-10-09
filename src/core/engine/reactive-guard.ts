import { HitlCheckpoint, SemanticNode } from '../types';

export class ReactiveGuard {
  private static CAPTCHA_SELECTORS = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]',
    'iframe[src*="challenges.cloudflare"]',
    '#cf-turnstile',
    '.g-recaptcha',
    '.h-captcha',
    '#captcha'
  ];

  private static PAYMENT_KEYWORDS = [
    'pay now',
    'complete order',
    'place order',
    'authorize payment',
    'make payment',
    'buy now',
    'confirm purchase',
    'submit order',
    'pay rs',
    'pay $'
  ];

  private static OTP_KEYWORDS = [
    'enter otp',
    'one time password',
    'verification code',
    'security code',
    '2-step verification',
    'two-factor'
  ];

  public static inspectPageBarriers(nodes: SemanticNode[]): HitlCheckpoint | null {
    // 1. CAPTCHA Check
    for (const selector of this.CAPTCHA_SELECTORS) {
      if (document.querySelector(selector)) {
        return {
          reason: 'captcha_detected',
          message: 'Security challenge (CAPTCHA / Turnstile) detected on page. Please solve the verification challenge to proceed.',
          suggestedAction: 'Solve captcha and click Resume'
        };
      }
    }

    // 2. OTP / 2FA Check
    const pageText = document.body.innerText.toLowerCase();
    for (const keyword of this.OTP_KEYWORDS) {
      if (pageText.includes(keyword)) {
        const hasOtpInput = nodes.some(
          (n) => n.isInput && (n.name.toLowerCase().includes('otp') || n.name.toLowerCase().includes('code') || n.placeholder?.toLowerCase().includes('otp'))
        );
        if (hasOtpInput) {
          return {
            reason: '2fa_required',
            message: 'One-Time Password (OTP) or 2FA verification required. Please enter your secure authentication code.',
            suggestedAction: 'Enter OTP on page and click Resume'
          };
        }
      }
    }

    return null;
  }

  public static isHighRiskAction(description: string, targetText?: string): boolean {
    const combined = `${description} ${targetText || ''}`.toLowerCase();
    return this.PAYMENT_KEYWORDS.some((kw) => combined.includes(kw));
  }

  public static createPaymentApprovalCheckpoint(amountOrSummary?: string): HitlCheckpoint {
    return {
      reason: 'payment_approval',
      message: `Agent is ready to finalize action${amountOrSummary ? ` (${amountOrSummary})` : ''}. Review and approve the final transaction.`,
      options: ['Approve & Execute', 'Cancel Workflow'],
      suggestedAction: 'User confirmation required for financial or irreversible operations'
    };
  }

  public static createRecoveryCheckpoint(errorMessage: string, options?: string[]): HitlCheckpoint {
    return {
      reason: 'error_recovery',
      message: `Encountered obstacle: ${errorMessage}. How would you like the agent to proceed?`,
      options: options || ['Retry Step', 'Intervene Manually & Resume', 'Skip Step', 'Abort'],
      suggestedAction: 'Select resolution option to resume'
    };
  }
}
