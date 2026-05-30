export const costBreakdown = [
  { label: "Mortgage", value: 1150000, fill: "#10212B" },
  { label: "Transfer Tax", value: 28850, fill: "#E16B47" },
  { label: "Property Tax", value: 39200, fill: "#B99239" },
  { label: "Risk Loadings", value: 29000, fill: "#8C5B4A" },
  { label: "Transit Dividend", value: -87000, fill: "#2B6A57" },
];

export const scenarioData = [
  { scenario: "Bull", cost: 1198000 },
  { scenario: "Base", cost: 1247000 },
  { scenario: "Bear", cost: 1311000 },
];

export const flags = {
  red: [
    "Heritage Part IV designated. Exterior renovations require heritage review.",
    "2 active structural permits detected within the immediate context window.",
  ],
  yellow: [
    "14 development applications within 500m indicate future density and assessment pressure.",
    "RentSafeTO not applicable, so building-condition confidence is based on permit proxies.",
  ],
  green: [
    "Transit dividend estimated at $87,000 over 10 years versus a car-dependent baseline.",
    "First-time buyer rebate and FHSA eligibility reduce near-term cash strain.",
  ],
};

export const sampleInputs = {
  address: "401 Richmond St W, Toronto",
  listPrice: "$850,000",
  buyerProfile: "First-time",
  downPayment: "10%",
};
