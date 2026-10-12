import { BillCandidateData, BillCategory, RecurrenceFrequency, SaveCandidate } from '../records/types';
import { RecurrenceCalculator } from './recurrence-calculator';

export interface PageInspectionContext {
  url: string;
  title: string;
  text: string;
  headings: string[];
  metaTags?: Record<string, string>;
}

export class BillDetector {
  private static CONFIRMATION_PHRASES = [
    'payment successful',
    'payment received',
    'transaction successful',
    'payment confirmed',
    'payment complete',
    'bill payment successful',
    'recharge successful',
    'receipt of payment',
    'payment receipt',
    'thank you for your payment',
    'payment has been processed',
    'paid successfully',
    'transaction completed',
    'payment reference id',
    'payment reference number',
    'transaction reference',
    'txn id:'
  ];

  private static CATEGORY_PATTERNS: Array<{ category: BillCategory; keywords: string[] }> = [
    {
      category: 'electricity',
      keywords: ['electricity', 'power', 'electric', 'cesc', 'bescom', 'tneb', 'discom', 'kseb', 'torrent power', 'adhani electricity', 'energy bill']
    },
    {
      category: 'water',
      keywords: ['water bill', 'water board', 'water supply', 'jal board', 'municipal water']
    },
    {
      category: 'internet',
      keywords: ['broadband', 'internet bill', 'fiber', 'wifi bill', 'act fibernet', 'airtel broadband', 'jio fiber', 'spectrum', 'comcast', 'xfinity']
    },
    {
      category: 'mobile',
      keywords: ['postpaid', 'prepaid recharge', 'mobile bill', 'cell bill', 'airtel', 'jio', 'vodafone', 'vi', 'verizon', 't-mobile', 'at&t']
    },
    {
      category: 'gas',
      keywords: ['piped gas', 'gas bill', 'png', 'lpg', 'indane', 'bharat gas', 'hp gas', 'mahanagar gas', 'igl']
    },
    {
      category: 'credit_card',
      keywords: ['credit card bill', 'card payment', 'minimum amount due', 'total amount due', 'hdfc card', 'icici card', 'sbi card', 'amex']
    },
    {
      category: 'insurance',
      keywords: ['premium paid', 'policy premium', 'lic', 'insurance payment', 'health insurance', 'car insurance', 'life insurance']
    },
    {
      category: 'rent',
      keywords: ['house rent', 'rent payment', 'property rent', 'monthly rent']
    },
    {
      category: 'subscription',
      keywords: ['subscription renewal', 'annual plan', 'monthly plan', 'netflix', 'spotify', 'prime membership', 'youtube premium']
    }
  ];

  private static CURRENCY_REGEX = /(?:₹|INR|Rs\.?|\$|USD|€|EUR|£|GBP)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi;
  private static AMOUNT_FOLLOWED_BY_CURRENCY_REGEX = /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:INR|USD|EUR|GBP|rupees|bucks)\b/gi;

  /**
   * Inspects a webpage context and returns a bill payment candidate if genuine evidence exists.
   */
  public static detectBillPayment(context: PageInspectionContext): SaveCandidate<BillCandidateData> | null {
    const lowerText = context.text.toLowerCase();
    const lowerTitle = context.title.toLowerCase();
    const lowerUrl = context.url.toLowerCase();

    // 1. Strict Payment Confirmation Verification
    const confirmationEvidence = this.findConfirmationPhrases(lowerText, lowerTitle);
    if (confirmationEvidence.length === 0) {
      // Not a confirmed payment page (could be checkout, login, or cart)
      return null;
    }

    // 2. Identify Category
    const categoryMatch = this.detectCategory(lowerText, lowerUrl, lowerTitle);
    const category = categoryMatch?.category || 'other';

    // 3. Extract Amount & Currency
    const amountMatch = this.extractAmount(context.text);
    if (!amountMatch || amountMatch.amount <= 0) {
      // A payment confirmation must have a detectable non-zero amount
      return null;
    }

    // 4. Extract Provider / Merchant Name
    const provider = this.detectProvider(context, category);

    // 5. Extract Account / Consumer Identifier if present
    const accountReference = this.extractAccountReference(context.text);

    // 6. Dates: Payment Date (default today) & Due Date
    const todayIso = RecurrenceCalculator.getTodayIso();
    const explicitDueDate = this.extractExplicitDueDate(context.text);

    // 7. Recurrence information
    const frequencyInfo = this.detectFrequency(context.text);
    const frequency: RecurrenceFrequency = frequencyInfo.frequency;
    const isFrequencyConfirmed = frequencyInfo.isExplicit;

    // Next due date: if explicit due date exists and is in the future, use it;
    // otherwise calculate based on payment date and frequency
    let nextEstimatedDueDate = '';
    let isDueDateEstimated = true;

    if (explicitDueDate && RecurrenceCalculator.getDaysDifference(explicitDueDate, todayIso) > 0) {
      nextEstimatedDueDate = explicitDueDate;
      isDueDateEstimated = false;
    } else {
      nextEstimatedDueDate = RecurrenceCalculator.calculateNextDueDate(
        todayIso,
        {
          frequency: frequency === 'one_off' ? 'monthly' : frequency,
          dayOfMonth: RecurrenceCalculator.parseIsoDate(todayIso).getDate(),
          isConfirmedByUser: false
        },
        todayIso
      );
      isDueDateEstimated = true;
    }

    // 8. Compile Evidence & Confidence
    const evidence: string[] = [
      ...confirmationEvidence,
      `Amount: ${amountMatch.currency} ${amountMatch.amount}`,
      `Category: ${category}`,
      `Provider: ${provider}`
    ];
    if (accountReference) {
      evidence.push(`Account/Consumer ID: ${accountReference}`);
    }
    if (explicitDueDate) {
      evidence.push(`Explicit Due Date: ${explicitDueDate}`);
    }
    if (isFrequencyConfirmed) {
      evidence.push(`Explicit Recurrence: ${frequency}`);
    }

    // Calculate confidence score (0.0 to 1.0)
    let confidence = 0.6; // Base for having confirmation phrase and valid amount
    if (category !== 'other') confidence += 0.15;
    if (accountReference) confidence += 0.1;
    if (isFrequencyConfirmed) confidence += 0.1;
    if (confirmationEvidence.length > 1) confidence += 0.05;
    confidence = Math.min(confidence, 1.0);

    // Deduplication Key: domain + category + month of payment to prevent duplicate prompts for same bill
    const parsedToday = RecurrenceCalculator.parseIsoDate(todayIso);
    const monthKey = `${parsedToday.getFullYear()}-${String(parsedToday.getMonth() + 1).padStart(2, '0')}`;
    const domain = this.extractDomain(context.url);
    const deduplicationKey = `bill:${domain}:${category}:${accountReference || 'generic'}:${monthKey}`;

    return {
      id: `candidate-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'bill_payment',
      extractedData: {
        provider,
        category,
        amount: amountMatch.amount,
        currency: amountMatch.currency,
        paymentDate: todayIso,
        explicitDueDate,
        estimatedNextDueDate: nextEstimatedDueDate,
        isDueDateEstimated,
        frequency,
        isFrequencyConfirmed,
        accountReference
      },
      sourcePage: {
        url: context.url,
        domain,
        title: context.title,
        timestamp: Date.now()
      },
      evidence,
      confidence,
      requiresUserConfirmation: true, // Always allow user to verify & confirm
      deduplicationKey
    };
  }

  private static findConfirmationPhrases(lowerText: string, lowerTitle: string): string[] {
    const evidence: string[] = [];
    for (const phrase of this.CONFIRMATION_PHRASES) {
      if (lowerText.includes(phrase) || lowerTitle.includes(phrase)) {
        evidence.push(`Matched confirmation: "${phrase}"`);
      }
    }
    return evidence;
  }

  private static detectCategory(
    lowerText: string,
    lowerUrl: string,
    lowerTitle: string
  ): { category: BillCategory; matchedKeyword: string } | null {
    for (const { category, keywords } of this.CATEGORY_PATTERNS) {
      for (const kw of keywords) {
        if (lowerText.includes(kw) || lowerUrl.includes(kw) || lowerTitle.includes(kw)) {
          return { category, matchedKeyword: kw };
        }
      }
    }
    return null;
  }

  public static extractAmount(text: string): { amount: number; currency: string } | null {
    // Look for currency prefix
    const matches = Array.from(text.matchAll(this.CURRENCY_REGEX));
    if (matches.length > 0) {
      for (const match of matches) {
        const rawNum = match[1].replace(/,/g, '');
        const num = parseFloat(rawNum);
        if (!isNaN(num) && num > 0 && num < 10000000) {
          let currency = '₹';
          const fullMatch = match[0].toUpperCase();
          if (fullMatch.includes('$') || fullMatch.includes('USD')) currency = '$';
          else if (fullMatch.includes('€') || fullMatch.includes('EUR')) currency = '€';
          else if (fullMatch.includes('£') || fullMatch.includes('GBP')) currency = '£';
          return { amount: num, currency };
        }
      }
    }

    // Suffix match
    const suffixMatches = Array.from(text.matchAll(this.AMOUNT_FOLLOWED_BY_CURRENCY_REGEX));
    if (suffixMatches.length > 0) {
      for (const match of suffixMatches) {
        const rawNum = match[1].replace(/,/g, '');
        const num = parseFloat(rawNum);
        if (!isNaN(num) && num > 0) {
          const suffix = match[0].toUpperCase();
          let currency = '₹';
          if (suffix.includes('USD')) currency = '$';
          else if (suffix.includes('EUR')) currency = '€';
          else if (suffix.includes('GBP')) currency = '£';
          return { amount: num, currency };
        }
      }
    }

    return null;
  }

  private static detectProvider(context: PageInspectionContext, category: BillCategory): string {
    const domain = this.extractDomain(context.url);

    // Well-known domain mappings
    const domainMap: Record<string, string> = {
      'cesc.co.in': 'CESC Limited',
      'airtel.in': 'Airtel',
      'jio.com': 'Jio',
      'bescom.co.in': 'BESCOM',
      'tnebnet.org': 'TNEB',
      'paytm.com': 'Paytm Bill Services',
      'amazon.in': 'Amazon Pay',
      'cred.club': 'CRED',
      'google.com': 'Google Pay'
    };

    if (domainMap[domain]) {
      return domainMap[domain];
    }

    // Try title extraction: e.g. "CESC Limited - Online Payment" or "Airtel Postpaid Payment"
    const titleParts = context.title.split(/[-–|:•]/).map((s) => s.trim());
    if (titleParts.length > 0 && titleParts[0].length >= 3 && titleParts[0].length <= 30) {
      const candidate = titleParts[0];
      if (!candidate.toLowerCase().includes('payment') && !candidate.toLowerCase().includes('success')) {
        return candidate;
      }
    }

    // Fallback: capitalized domain name or category name
    const domainName = domain.replace(/^www\./, '').split('.')[0];
    if (domainName.length > 2) {
      return domainName.charAt(0).toUpperCase() + domainName.slice(1);
    }

    return category !== 'other' ? `${category.toUpperCase()} Provider` : 'Bill Provider';
  }

  private static extractAccountReference(text: string): string | undefined {
    // Patterns for Consumer No, Account No, Customer ID, Card ending in
    const patterns = [
      /(?:consumer\s*(?:no|number|id)|ca\s*(?:no|number)|k\s*no)[\s:]*([0-9a-zA-Z-]{5,20})/i,
      /(?:account\s*(?:no|number|id))[\s:]*([0-9a-zA-Z-]{5,20})/i,
      /(?:card\s*ending\s*in|ending\s*in)[\s:]*([0-9]{4})/i,
      /(?:mobile\s*number|phone\s*no)[\s:]*([0-9]{10})/i
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private static extractExplicitDueDate(text: string): string | undefined {
    const patterns = [
      /(?:due\s*date|pay\s*by|before\s*date)[\s:]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
      /(?:due\s*date|pay\s*by)[\s:]*([a-zA-Z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          return RecurrenceCalculator.formatIsoDate(parsed);
        }
      }
    }
    return undefined;
  }

  private static detectFrequency(text: string): { frequency: RecurrenceFrequency; isExplicit: boolean } {
    const lower = text.toLowerCase();
    if (lower.includes('quarterly') || lower.includes('every 3 months')) {
      return { frequency: 'quarterly', isExplicit: true };
    }
    if (lower.includes('annual') || lower.includes('yearly') || lower.includes('per year')) {
      return { frequency: 'annual', isExplicit: true };
    }
    if (lower.includes('bi-monthly') || lower.includes('every 2 months')) {
      return { frequency: 'bi_monthly', isExplicit: true };
    }
    if (lower.includes('monthly') || lower.includes('per month') || lower.includes('every month') || lower.includes('billing cycle: 1 month')) {
      return { frequency: 'monthly', isExplicit: true };
    }

    // Default estimate for recurring utility bills
    return { frequency: 'monthly', isExplicit: false };
  }

  public static extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
}
