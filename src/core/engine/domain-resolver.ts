export interface DomainRoute {
  domain: string;
  defaultUrl: string;
  matchers: string[];
}

export class DomainResolver {
  private static ROUTE_MAP: DomainRoute[] = [
    {
      domain: 'cesc.co.in',
      defaultUrl: 'https://cesc.co.in/quickbill',
      matchers: ['cesc', 'cesc bill', 'calcutta electric']
    },
    {
      domain: 'amazon.in',
      defaultUrl: 'https://www.amazon.in',
      matchers: ['amazon', 'amazon.in', 'amazon prime']
    },
    {
      domain: 'flipkart.com',
      defaultUrl: 'https://www.flipkart.com',
      matchers: ['flipkart']
    },
    {
      domain: 'swiggy.com',
      defaultUrl: 'https://www.swiggy.com',
      matchers: ['swiggy']
    },
    {
      domain: 'zomato.com',
      defaultUrl: 'https://www.zomato.com',
      matchers: ['zomato']
    },
    {
      domain: 'paytm.com',
      defaultUrl: 'https://paytm.com/recharge',
      matchers: ['paytm', 'paytm recharge']
    },
    {
      domain: 'github.com',
      defaultUrl: 'https://github.com',
      matchers: ['github', 'gh repo']
    },
    {
      domain: 'bescom.co.in',
      defaultUrl: 'https://bescom.co.in',
      matchers: ['bescom', 'bangalore electricity']
    },
    {
      domain: 'tneb.gov.in',
      defaultUrl: 'https://www.tnebnet.org',
      matchers: ['tneb', 'tamil nadu electricity']
    }
  ];

  public static resolveTargetUrl(prompt: string, currentUrl: string): { targetUrl: string; needsNavigation: boolean; routeName?: string } {
    const lower = prompt.toLowerCase();

    // 1. Check if prompt specifies an explicit full URL
    const urlMatch = prompt.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      const explicitUrl = urlMatch[0];
      const isAlreadyThere = currentUrl.toLowerCase().startsWith(explicitUrl.toLowerCase());
      return {
        targetUrl: explicitUrl,
        needsNavigation: !isAlreadyThere,
        routeName: 'Direct URL'
      };
    }

    // 2. Check known brand & domain routes
    for (const route of this.ROUTE_MAP) {
      if (route.matchers.some((m) => lower.includes(m))) {
        const isCurrentDomain = this.isCurrentUrlMatchingDomain(currentUrl, route.domain);
        return {
          targetUrl: route.defaultUrl,
          needsNavigation: !isCurrentDomain,
          routeName: route.domain
        };
      }
    }

    // 3. Check if user is already on an active web page (not blank / newtab)
    if (currentUrl && currentUrl.startsWith('http') && !currentUrl.includes('chrome://') && !currentUrl.includes('about:blank')) {
      return {
        targetUrl: currentUrl,
        needsNavigation: false
      };
    }

    // 4. Default: Search fallback navigation
    const encoded = encodeURIComponent(prompt);
    return {
      targetUrl: `https://www.google.com/search?q=${encoded}`,
      needsNavigation: true,
      routeName: 'Web Search'
    };
  }

  private static isCurrentUrlMatchingDomain(currentUrl: string, targetDomain: string): boolean {
    try {
      if (!currentUrl || !currentUrl.startsWith('http')) return false;
      const parsed = new URL(currentUrl);
      return parsed.hostname.toLowerCase().includes(targetDomain.toLowerCase());
    } catch {
      return false;
    }
  }
}
