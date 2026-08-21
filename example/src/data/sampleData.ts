export const sampleData = {
  user: {
    id: 4821,
    name: "Alexey Petrov",
    email: "alexey.petrov@example.com",
    isActive: true,
    isVerified: false,
    balance: -152.75,
    rating: 4.8,
    address: {
      city: "Moscow",
      street: "Tverskaya st.",
      zip: "125009",
      coordinates: {
        lat: 55.7558,
        lng: 37.6173,
      },
    },
    tags: ["premium", "beta-tester", "early-adopter"],
    lastLogin: null,
  },
  orders: [
    {
      orderId: "ORD-1001",
      total: 249.99,
      paid: true,
      items: [
        { sku: "A100", title: "Wireless Mouse", qty: 1, price: 29.99 },
        { sku: "B200", title: "Mechanical Keyboard", qty: 1, price: 219.99 },
      ],
    },
    {
      orderId: "ORD-1002",
      total: 0,
      paid: false,
      items: [],
    },
  ],
  meta: {
    generatedAt: "2026-08-20T12:00:00Z",
    version: 3,
    flags: [true, false, true],
    notes: null,
  },
};

export default sampleData;
