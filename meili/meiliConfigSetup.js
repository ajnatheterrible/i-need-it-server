import client from "./meili.js";

async function setupMeiliFilters() {
  const index = client.index("listings");

  await index.updateFilterableAttributes([
    "size",
    "category",
    "department",
    "condition",
    "price",
  ]);
}

setupMeiliFilters();
