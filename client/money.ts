/** An amount of money as it is shown, e.g. $12,000 or $-1,500 as in the original. */
export const formatMoney = (money: number) => `$${money < 0 ? "-" : ""}${Math.abs(money).toLocaleString("en-US")}`;
