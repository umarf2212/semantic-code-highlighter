interface OrderItem {
  sku: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  total: number;
}

export async function createOrder(
  userId: string,
  items: OrderItem[]
): Promise<Order> {
  if (!userId || items.length === 0) {
    throw new Error("A user and at least one item are required");
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const discount = subtotal >= 100 ? subtotal * 0.1 : 0;
  const total = subtotal - discount;

  const response = await fetch("https://example.test/orders", {
    method: "POST",
    body: JSON.stringify({ userId, items, total })
  });

  const payload = (await response.json()) as { order_id: string };
  return normalizeOrder(payload, total);
}

function normalizeOrder(
  payload: { order_id: string },
  total: number
): Order {
  return { id: payload.order_id, total };
}

