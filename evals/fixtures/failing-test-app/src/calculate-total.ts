export type LineItem = {
  price: number;
  quantity: number;
};

export function calculateTotal(items: LineItem[]): number {
  return items.reduce((total, item) => total + item.price, 0);
}
