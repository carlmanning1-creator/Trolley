// Step 3 of aisle auto-sort: turn Open Food Facts category tags into one of our aisle names.
// Tags are checked from most specific (last) to most general (first); the first rule that
// matches wins, so "en:frozen-desserts" lands in Frozen before "en:desserts" could.

const RULES: [RegExp, string][] = [
  [/frozen|ice-cream|ice-creams|sorbets/, "Frozen"],
  [/baby|infant/, "Baby"],
  [/pet-food|dog-food|cat-food/, "Pet"],
  [/breakfast-cereals|cereals-and-potatoes:breakfast|muesli|porridge|oat-flakes|granola/, "Breakfast"],
  [/cheeses|milks|dairies|yogurts|yoghurts|butters|creams|eggs/, "Dairy & Eggs"],
  [/fresh-meats|meats|poultry|sausages|seafood|fishes|fish-and|beef|pork|lamb|chicken/, "Meat & Seafood"],
  [/deli|hams|salami|cured-meats|olives|hummus|dips/, "Deli"],
  [/breads|bakery|pastries|cakes|buns|wraps|tortillas|crumpets/, "Bakery"],
  [/fresh-fruits|fresh-vegetables|^en:fruits$|^en:vegetables$|salads|herbs|mushrooms|potatoes/, "Fruit & Veg"],
  [/beverages|drinks|waters|sodas|juices|coffees|teas|beers|wines|alcoholic|energy-drinks|cordials/, "Drinks"],
  [/chips|crisps|snacks|biscuits|cookies|chocolates|confectioner|candies|sweets|lollies|popcorn|crackers|bars/, "Snacks & Lollies"],
  [/chilled|fresh-pasta|ready-meals|tofu/, "Fridge"],
  [/pastas|rices|noodles|flours|sugars|spreads|sauces|condiments|canned|tinned|soups|oils|vinegars|spices|stocks|baking|legumes|nuts|dried|jams|honeys|groceries|cooking/, "Pantry"],
  [/cosmetics|hygiene|shampoos|soaps|toothpastes|deodorants|medicines|vitamins|supplements/, "Health & Beauty"],
  [/cleaning|detergents|household/, "Cleaning & Household"],
];

export function aisleForOffCategories(tags: string[] | undefined | null): string | null {
  if (!tags?.length) return null;
  for (const tag of [...tags].reverse()) {
    const t = tag.toLowerCase();
    for (const [re, aisle] of RULES) if (re.test(t)) return aisle;
  }
  return null;
}
