# Do It For Me (DIFM) - Agentic Browser Automation

**Do It For Me (DIFM)** is a privacy-first, zero-overhead autonomous browser extension for Chromium (Chrome, Brave, Edge). It executes natural language multi-step actions in the background, automates recurring utility bills and price tracking, and halts for user authorization before financial operations.

---

## Key Features

1. **Natural Language Task Execution:** Instruct the agent directly (e.g. *"Pay CESC bill for consumer 01029384912"*, *"Add Sony XM5 to cart if price is below ₹24,990"*).
2. **Zero-Token Local Execution:** Uses deep AXTree semantic parsing (<3KB payloads) and compiles workflows into deterministic macros.
3. **Reactive Guard & HITL (Human-in-the-Loop):** Automatically halts on CAPTCHAs, 2FA/OTP prompts, and checkout payment buttons, allowing you to confirm and resume with one click.
4. **Scheduled Background Automations:** Synchronized with `chrome.alarms` to run recurring tasks (monthly bills, periodic price checks).
5. **Context Vault & Notes:** Encrypted local store for consumer IDs, account numbers, and preferences (`{{CESC_CONSUMER_ID}}`).
6. **In-Tab Spotlight HUD (`Cmd+Shift+K` / `Ctrl+Shift+K`):** Summon a floating command bar anywhere without leaving your tab.
7. **Interactive Teach Mode:** Click and point directly on any webpage to visually record custom automations.
8. **Multi-Model Bridge:** Chrome Built-in Prompt API (Gemini Nano) + direct BYOK for OpenAI, Anthropic, and Gemini Flash.

---

## Installation & Testing

1. **Build the extension:**
   ```bash
   pnpm install
   pnpm build
   ```
2. **Load into Chrome or Brave:**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `dist/` directory in this repo
3. **Usage:**
   - Click the DIFM icon or open the **Side Panel**
   - Or press `Cmd+Shift+K` / `Ctrl+Shift+K` on any webpage to open the Spotlight HUD.
