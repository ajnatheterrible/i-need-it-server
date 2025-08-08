import client from "./meili.js";

export function toMeiliDoc(listing) {
  const d = listing.toObject ? listing.toObject() : listing;

  return {
    _id: String(d._id),
    title: d.title,
    designer: d.designer,
    description: d.description,
    tags: d.tags || [],
    department: d.department,
    category: d.category,
    subCategory: d.subCategory,
    size: d.size,
    color: d.color,
    condition: d.condition,
    price: typeof d.price === "number" ? d.price : Number(d.price ?? 0),
    favoritesCount: d.favoritesCount ?? 0,
    isSold: !!d.isSold,
    isDeleted: !!d.isDeleted,
    isDraft: !!d.isDraft,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    thumbnail: d.thumbnail,
    seller: d.seller,
  };
}

export async function upsertListingToMeili(listing) {
  const doc = toMeiliDoc(listing);

  if (doc.isDraft || doc.isDeleted || doc.isSold) {
    try {
      await client.index("listings").deleteDocument(doc._id);
    } catch {}
    return;
  }
  await client.index("listings").addDocuments([doc]);
}

export async function updatePartialInMeili(id, partial) {
  await client
    .index("listings")
    .updateDocuments([{ _id: String(id), ...partial }]);
}

export async function removeListingFromMeili(id) {
  await client.index("listings").deleteDocument(String(id));
}
