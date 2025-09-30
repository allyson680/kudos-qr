// src/lib/outOfTokens.ts

export const OUT_OF_TOKENS_MESSAGES: string[] = [
  "🎉 You’ve given out all 3 of your shiny virtual tokens today. Don’t worry — your stash magically refills at midnight!",
  "🦺 All 3 tokens poured today — concrete’s gotta set. Fresh load arrives tomorrow.",
  "🔨 You swung the hammer 3 times today and nailed your task of giving out tokens. Tool’s cooling down — pick it up again tomorrow.",
  "✨ The Token Dozer Driver says you’ve been too nice today. 3/3 Tokens give. More will be delivered overnight!",
  "🔥 Whoa there, this ain't no ATM! 3/3 Token withdrawls used. Token Machine is cooling down overnight, back online tomorrow!",
  "😅 You’ve already been too nice today! 3/3 Tokens given. HR says you’re cut off until tomorrow!",
  "⚡ Breaker tripped — 3 tokens used. Reset overnight, power’s back in the morning.",
  "🧰 You’ve emptied your 3 Token toolbox. Re-stock comes with tomorrow’s sunrise!",
  "📦 All shipments sent: 3 tokens delivered. Next truckload arrives tomorrow.",
  "💸 Wallet’s empty — 3 tokens spent. Next payday is tomorrow.",
];

export const COMPANY_CAP_MESSAGES: string[] = [
  "🏢 Company cap reached: 30 tokens this month. New load drops next month.",
  "🚧 Yard’s empty — your company used all 30 tokens for this month. Fresh shipment next month.",
  "🏗 Company gave 30 tokens already this month. New pallet arrives next month.",
  "🔩 Company token bin is empty (30/30). Refill when the calendar flips.",
  "📦 All 30 monthly tokens shipped. Next truck rolls in next month.",
  "🛠️ Company toolbox is out of tokens (30/30). Restock next month.",
];

let _bagDaily: string[] = [];
let _bagCompany: string[] = [];

function shuffleInPlace(a: string[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

export function getNextOutOfTokensMessage(): string {
  if (_bagDaily.length === 0) { _bagDaily = [...OUT_OF_TOKENS_MESSAGES]; shuffleInPlace(_bagDaily); }
  return _bagDaily.pop() as string;
}

export function getNextCompanyCapMessage(): string {
  if (_bagCompany.length === 0) { _bagCompany = [...COMPANY_CAP_MESSAGES]; shuffleInPlace(_bagCompany); }
  return _bagCompany.pop() as string;
}
